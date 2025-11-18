(function () {
  const STORAGE_KEY = "restaurant-menu-boards";
  const menuListeners = new Set();
  const boardListeners = new Set();
  const restaurantListeners = new Set();
  let cachedState = null;
  let memoryState = null;
  let lastSerializedState = null;
  let storageEnabled = typeof window !== "undefined" && "localStorage" in window;
  const remoteConfig =
    typeof window !== "undefined" && window.MENU_SHEETS_CONFIG
      ? window.MENU_SHEETS_CONFIG
      : {};
  const remoteEndpoint =
    typeof remoteConfig.endpoint === "string" ? remoteConfig.endpoint.trim() : "";
  const remoteToken = typeof remoteConfig.token === "string" ? remoteConfig.token.trim() : "";
  const remoteTimeout =
    typeof remoteConfig.timeoutMs === "number" && remoteConfig.timeoutMs > 0
      ? remoteConfig.timeoutMs
      : 15000;
  const remotePollInterval =
    typeof remoteConfig.pollInterval === "number" && remoteConfig.pollInterval >= 5000
      ? remoteConfig.pollInterval
      : 15000;
  const remoteEnabled = Boolean(remoteEndpoint && typeof window.fetch === "function");
  const remoteHeaders = Object.assign(
    { "Content-Type": "application/json" },
    typeof remoteConfig.headers === "object" && remoteConfig.headers ? remoteConfig.headers : {}
  );
  const remoteMode = typeof remoteConfig.mode === "string" ? remoteConfig.mode : "cors";
  const remoteGetAction = remoteConfig.getAction || "getMenu";
  const remoteSetAction = remoteConfig.setAction || "setMenu";
  const remoteState = {
    inFlight: null
  };
  const broadcastChannel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("restaurant-menu-boards") : null;

  function broadcastState(serialized) {
    if (!broadcastChannel || typeof serialized !== "string" || !serialized) {
      return;
    }
    try {
      broadcastChannel.postMessage({ type: "STATE_UPDATE", payload: serialized });
    } catch (error) {
      console.warn("Unable to broadcast menu changes", error);
    }
  }

  function clone(object) {
    return JSON.parse(JSON.stringify(object));
  }

  function generateId() {
    return "board-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  }

  function generateRestaurantId() {
    return "restaurant-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  }

  function normalizeItem(item = {}) {
    return {
      name: typeof item.name === "string" ? item.name : "Unnamed Item",
      description: typeof item.description === "string" ? item.description : "",
      price:
        typeof item.price === "number" || typeof item.price === "string"
          ? String(item.price)
          : "",
      image:
        typeof item.image === "string" && item.image.trim() ? item.image.trim() : ""
    };
  }

  function normalizeSection(section = {}) {
    return {
      name: typeof section.name === "string" && section.name.trim()
        ? section.name
        : "Untitled Section",
      description: typeof section.description === "string" ? section.description : "",
      items: Array.isArray(section.items) ? section.items.map(normalizeItem) : []
    };
  }

  function normalizeBackground(background = {}, index = 0) {
    if (typeof background !== "object" || background === null) {
      return null;
    }

    const source =
      typeof background.source === "string" && background.source.trim()
        ? background.source.trim()
        : "";

    if (!source) {
      return null;
    }

    const name =
      typeof background.name === "string" && background.name.trim()
        ? background.name.trim()
        : `Background ${index + 1}`;

    const id =
      typeof background.id === "string" && background.id.trim()
        ? background.id.trim()
        : `bg-${index + 1}`;

    return {
      id,
      name,
      source,
      origin: background.origin === "upload" ? "upload" : "url"
    };
  }

  function normalizeMenu(menu = {}) {
    const source = typeof menu === "object" && menu !== null ? menu : {};
    const fallback =
      typeof window.DEFAULT_MENU === "object" && window.DEFAULT_MENU
        ? window.DEFAULT_MENU
        : { title: "Menu", sections: [] };

    const normalizedFallbackBackgrounds = Array.isArray(fallback.backgrounds)
      ? fallback.backgrounds.map(normalizeBackground).filter(Boolean)
      : [];

    const normalizedSourceBackgrounds = Array.isArray(source.backgrounds)
      ? source.backgrounds.map(normalizeBackground).filter(Boolean)
      : [];

    const backgrounds = normalizedSourceBackgrounds.length
      ? normalizedSourceBackgrounds
      : normalizedFallbackBackgrounds;

    const fallbackActiveBackgroundId = normalizedFallbackBackgrounds.find(
      (background) => background.id === fallback.activeBackgroundId
    )
      ? fallback.activeBackgroundId
      : normalizedFallbackBackgrounds[0]?.id || "";

    const selectedBackgroundId =
      typeof source.activeBackgroundId === "string" ? source.activeBackgroundId : "";

    const activeBackgroundId = backgrounds.find((background) => background.id === selectedBackgroundId)
      ? selectedBackgroundId
      : backgrounds[0]?.id || fallbackActiveBackgroundId || "";

    return {
      title: typeof source.title === "string" && source.title.trim()
        ? source.title
        : fallback.title || "Menu",
      subtitle: typeof source.subtitle === "string" ? source.subtitle : fallback.subtitle || "",
      sections: Array.isArray(source.sections) && source.sections.length
        ? source.sections.map(normalizeSection)
        : (fallback.sections || []).map(normalizeSection),
      backgrounds,
      activeBackgroundId
    };
  }

  function createBoardFromMenu(menu, name, id) {
    return {
      id: typeof id === "string" && id.trim() ? id.trim() : generateId(),
      name: typeof name === "string" && name.trim() ? name.trim() : "Menu Board",
      menu: normalizeMenu(menu)
    };
  }

  function normalizeBoardsState(state = {}) {
    if (!Array.isArray(state.boards) && typeof state === "object" && state !== null) {
      if (state.title || state.sections || state.menu) {
        const legacyMenu = state.menu || state;
        const legacyBoard = createBoardFromMenu(
          legacyMenu,
          state.name || state.title || "Main Board"
        );
        return { boards: [legacyBoard], activeBoardId: legacyBoard.id };
      }
    }

    const boards = Array.isArray(state.boards)
      ? state.boards
          .map((board, index) => {
            if (!board || typeof board !== "object") {
              return null;
            }
            const id =
              typeof board.id === "string" && board.id.trim() ? board.id.trim() : generateId();
            const name =
              typeof board.name === "string" && board.name.trim()
                ? board.name.trim()
                : `Board ${index + 1}`;
            const menuSource = board.menu || board;
            return { id, name, menu: normalizeMenu(menuSource) };
          })
          .filter(Boolean)
      : [];

    if (!boards.length) {
      boards.push(createBoardFromMenu(window.DEFAULT_MENU, "Main Board"));
    }

    const activeBoardId = boards.some((board) => board.id === state.activeBoardId)
      ? state.activeBoardId
      : boards[0].id;

    return { boards, activeBoardId };
  }

  function createRestaurantFromBoardState(boardState, name, id) {
    const label = typeof name === "string" && name.trim() ? name.trim() : "Restaurant";
    const restaurantId = typeof id === "string" && id.trim() ? id.trim() : generateRestaurantId();
    return {
      id: restaurantId,
      name: label,
      boards: boardState.boards,
      activeBoardId: boardState.activeBoardId
    };
  }

  function normalizeRestaurant(restaurant = {}, index = 0) {
    if (!restaurant || typeof restaurant !== "object") {
      return null;
    }

    const id =
      typeof restaurant.id === "string" && restaurant.id.trim()
        ? restaurant.id.trim()
        : generateRestaurantId();

    const name =
      typeof restaurant.name === "string" && restaurant.name.trim()
        ? restaurant.name.trim()
        : `Restaurant ${index + 1}`;

    const boardSource = Array.isArray(restaurant.boards)
      ? { boards: restaurant.boards, activeBoardId: restaurant.activeBoardId }
      : restaurant;

    const normalizedBoards = normalizeBoardsState(boardSource);

    return {
      id,
      name,
      boards: normalizedBoards.boards,
      activeBoardId: normalizedBoards.activeBoardId
    };
  }

  function normalizeRestaurantsState(state = {}) {
    let restaurants = [];

    if (Array.isArray(state.restaurants) && state.restaurants.length) {
      restaurants = state.restaurants.map(normalizeRestaurant).filter(Boolean);
    } else {
      const legacyBoardsState = normalizeBoardsState(state);
      restaurants = [
        createRestaurantFromBoardState(
          legacyBoardsState,
          state.restaurantName || state.name || "Main Restaurant",
          state.restaurantId || state.id
        )
      ];
    }

    if (!restaurants.length) {
      const fallbackBoard = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");
      restaurants.push({
        id: generateRestaurantId(),
        name: "Restaurant",
        boards: [fallbackBoard],
        activeBoardId: fallbackBoard.id
      });
    }

    const activeRestaurantId = restaurants.some((restaurant) => restaurant.id === state.activeRestaurantId)
      ? state.activeRestaurantId
      : restaurants[0].id;

    return { restaurants, activeRestaurantId };
  }

  function disableStorage(error) {
    if (!storageEnabled) return;
    storageEnabled = false;
    console.warn("Local storage is unavailable; using in-memory data instead.", error);
  }

  function safeGetItem(key) {
    if (!storageEnabled) {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      disableStorage(error);
      return null;
    }
  }

  function safeSetItem(key, value) {
    if (!storageEnabled) {
      return false;
    }

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      disableStorage(error);
      return false;
    }
  }

  function safeRemoveItem(key) {
    if (!storageEnabled) {
      return;
    }

    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      disableStorage(error);
    }
  }

  function ensureMemoryState() {
    if (!memoryState) {
      memoryState = normalizeRestaurantsState({});
      lastSerializedState = JSON.stringify(memoryState);
    }
    return memoryState;
  }

  function readFromStorage() {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) {
      return ensureMemoryState();
    }

    try {
      const parsed = normalizeRestaurantsState(JSON.parse(raw));
      lastSerializedState = JSON.stringify(parsed);
      return parsed;
    } catch (error) {
      console.warn("Unable to parse stored menu data. Falling back to defaults.", error);
      safeRemoveItem(STORAGE_KEY);
      return ensureMemoryState();
    }
  }

  function getState() {
    if (!cachedState) {
      cachedState = readFromStorage();
    }
    return clone(cachedState);
  }

  function resolveRestaurantId(state, requestedId) {
    if (requestedId && state.restaurants.some((restaurant) => restaurant.id === requestedId)) {
      return requestedId;
    }
    return state.activeRestaurantId;
  }

  function getRestaurantById(state, requestedId) {
    const restaurantId = resolveRestaurantId(state, requestedId);
    return (
      state.restaurants.find((restaurant) => restaurant.id === restaurantId) || state.restaurants[0]
    );
  }

  function resolveBoardId(restaurant, requestedId) {
    if (requestedId && restaurant.boards.some((board) => board.id === requestedId)) {
      return requestedId;
    }
    return restaurant.activeBoardId;
  }

  function resolveBoardContext(state, options = {}) {
    const restaurant = getRestaurantById(state, options.restaurantId);
    const boardId = resolveBoardId(restaurant, options.boardId);
    const board = restaurant.boards.find((entry) => entry.id === boardId) || restaurant.boards[0];
    return { restaurant, board, boardId };
  }

  function commitState(nextState) {
    const normalized = normalizeRestaurantsState(nextState);
    const serialized = JSON.stringify(normalized);
    cachedState = clone(normalized);
    memoryState = normalized;
    lastSerializedState = serialized;
    safeSetItem(STORAGE_KEY, serialized);
    notifyBoardListeners();
    notifyMenuListeners();
    notifyRestaurantListeners();
    broadcastState(serialized);
    if (remoteEnabled) {
      remoteSaveState(normalized)
        .then((remotePayload) => {
          applyExternalState(remotePayload, { force: true });
        })
        .catch((error) => {
          console.error("Unable to save menu to Google Sheets", error);
        });
    }
    return getState();
  }

  function applyExternalState(nextState, options = {}) {
    if (!nextState || typeof nextState !== "object") {
      return null;
    }

    const normalized = normalizeRestaurantsState(nextState);
    const serialized = JSON.stringify(normalized);
    if (!options.force && serialized === lastSerializedState) {
      return normalized;
    }

    cachedState = clone(normalized);
    memoryState = normalized;
    lastSerializedState = serialized;
    if (options.persist !== false) {
      safeSetItem(STORAGE_KEY, serialized);
    }
    notifyBoardListeners();
    notifyMenuListeners();
    notifyRestaurantListeners();
    if (options.broadcast !== false) {
      broadcastState(serialized);
    }
    return normalized;
  }

  function getMenu(boardId, restaurantId) {
    const state = getState();
    const { board } = resolveBoardContext(state, { boardId, restaurantId });
    return clone(board.menu);
  }

  function getBoards(options = {}) {
    const { restaurantId, withMenus = false } = options;
    const state = getState();
    const restaurant = getRestaurantById(state, restaurantId);
    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      activeBoardId: restaurant.activeBoardId,
      boards: restaurant.boards.map((board) => {
        const payload = { id: board.id, name: board.name };
        if (withMenus) {
          payload.menu = clone(board.menu);
        }
        return payload;
      })
    };
  }

  function saveMenu(menu, boardId, restaurantId) {
    const normalizedMenu = normalizeMenu(menu);
    const state = getState();
    const { restaurant, boardId: targetBoardId } = resolveBoardContext(state, {
      boardId,
      restaurantId
    });

    const updatedRestaurant = {
      ...restaurant,
      boards: restaurant.boards.map((board) =>
        board.id === targetBoardId ? { ...board, menu: normalizedMenu } : board
      )
    };
    const restaurants = state.restaurants.map((entry) =>
      entry.id === restaurant.id ? updatedRestaurant : entry
    );
    commitState({ ...state, restaurants });
    return getMenu(targetBoardId, restaurant.id);
  }

  function resetMenu(boardId, restaurantId) {
    return saveMenu(window.DEFAULT_MENU, boardId, restaurantId);
  }

  function setActiveBoard(boardId, restaurantId) {
    const state = getState();
    const restaurant = getRestaurantById(state, restaurantId);
    if (!restaurant.boards.some((board) => board.id === boardId)) {
      return state;
    }
    if (restaurant.activeBoardId === boardId) {
      return state;
    }
    const updatedRestaurant = { ...restaurant, activeBoardId: boardId };
    const restaurants = state.restaurants.map((entry) =>
      entry.id === restaurant.id ? updatedRestaurant : entry
    );
    return commitState({ ...state, restaurants });
  }

  function renameBoard(boardId, name, restaurantId) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const state = getState();
    const restaurant = getRestaurantById(state, restaurantId);
    const updatedRestaurant = {
      ...restaurant,
      boards: restaurant.boards.map((board) =>
        board.id === boardId && trimmed ? { ...board, name: trimmed } : board
      )
    };
    const restaurants = state.restaurants.map((entry) =>
      entry.id === restaurant.id ? updatedRestaurant : entry
    );
    commitState({ ...state, restaurants });
  }

  function createBoard(options = {}) {
    const state = getState();
    const restaurant = getRestaurantById(state, options.restaurantId);
    const sourceBoard = options.sourceBoardId
      ? restaurant.boards.find((board) => board.id === options.sourceBoardId)
      : null;
    const name =
      typeof options.name === "string" && options.name.trim()
        ? options.name.trim()
        : sourceBoard
          ? `${sourceBoard.name} Copy`
          : `Board ${restaurant.boards.length + 1}`;
    const menu = sourceBoard ? clone(sourceBoard.menu) : normalizeMenu(window.DEFAULT_MENU);
    const newBoard = { id: generateId(), name, menu };
    const updatedRestaurant = {
      ...restaurant,
      boards: [...restaurant.boards, newBoard],
      activeBoardId: newBoard.id
    };
    const restaurants = state.restaurants.map((entry) =>
      entry.id === restaurant.id ? updatedRestaurant : entry
    );
    commitState({ ...state, restaurants });
    return newBoard;
  }

  function deleteBoard(boardId, restaurantId) {
    const state = getState();
    const restaurant = getRestaurantById(state, restaurantId);
    if (restaurant.boards.length <= 1) {
      const fallback = createBoardFromMenu(
        window.DEFAULT_MENU,
        "Main Board",
        restaurant.boards[0].id
      );
      const updatedRestaurant = {
        ...restaurant,
        boards: [fallback],
        activeBoardId: fallback.id
      };
      const restaurants = state.restaurants.map((entry) =>
        entry.id === restaurant.id ? updatedRestaurant : entry
      );
      return commitState({ ...state, restaurants });
    }

    const targetBoardId = resolveBoardId(restaurant, boardId);
    const boards = restaurant.boards.filter((board) => board.id !== targetBoardId);
    const activeBoardId =
      restaurant.activeBoardId === targetBoardId ? boards[0].id : restaurant.activeBoardId;
    const updatedRestaurant = { ...restaurant, boards, activeBoardId };
    const restaurants = state.restaurants.map((entry) =>
      entry.id === restaurant.id ? updatedRestaurant : entry
    );
    return commitState({ ...state, restaurants });
  }

  function getRestaurants(options = {}) {
    const { withBoards = false, withMenus = false } = options;
    const state = getState();
    return {
      activeRestaurantId: state.activeRestaurantId,
      restaurants: state.restaurants.map((restaurant) => {
        const payload = {
          id: restaurant.id,
          name: restaurant.name,
          boardCount: restaurant.boards.length,
          activeBoardId: restaurant.activeBoardId
        };
        if (withBoards) {
          payload.boards = restaurant.boards.map((board) => {
            const boardPayload = { id: board.id, name: board.name };
            if (withMenus) {
              boardPayload.menu = clone(board.menu);
            }
            return boardPayload;
          });
        }
        return payload;
      })
    };
  }

  function setActiveRestaurant(restaurantId) {
    const state = getState();
    if (!state.restaurants.some((restaurant) => restaurant.id === restaurantId)) {
      return state;
    }
    if (state.activeRestaurantId === restaurantId) {
      return state;
    }
    return commitState({ ...state, activeRestaurantId: restaurantId });
  }

  function renameRestaurant(restaurantId, name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const state = getState();
    const restaurants = state.restaurants.map((restaurant) =>
      restaurant.id === restaurantId && trimmed ? { ...restaurant, name: trimmed } : restaurant
    );
    commitState({ ...state, restaurants });
  }

  function createRestaurant(options = {}) {
    const state = getState();
    const sourceRestaurant = options.sourceRestaurantId
      ? state.restaurants.find((restaurant) => restaurant.id === options.sourceRestaurantId)
      : null;
    const trimmedName = typeof options.name === "string" ? options.name.trim() : "";
    const name = trimmedName
      ? trimmedName
      : sourceRestaurant
        ? `${sourceRestaurant.name} Copy`
        : `Restaurant ${state.restaurants.length + 1}`;

    let boards = [];
    if (sourceRestaurant) {
      boards = sourceRestaurant.boards.map((board, index) => ({
        id: generateId(),
        name: board.name || `Board ${index + 1}`,
        menu: clone(board.menu)
      }));
    } else {
      boards = [createBoardFromMenu(window.DEFAULT_MENU, "Main Board")];
    }

    if (!boards.length) {
      boards.push(createBoardFromMenu(window.DEFAULT_MENU, "Main Board"));
    }

    const activeBoardId = boards[0].id;
    const newRestaurant = {
      id: generateRestaurantId(),
      name,
      boards,
      activeBoardId
    };

    const restaurants = [...state.restaurants, newRestaurant];
    commitState({ restaurants, activeRestaurantId: newRestaurant.id });
    return newRestaurant;
  }

  function deleteRestaurant(restaurantId) {
    const state = getState();
    if (state.restaurants.length <= 1) {
      const fallbackBoard = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");
      const fallbackRestaurant = {
        id: state.restaurants[0]?.id || generateRestaurantId(),
        name: state.restaurants[0]?.name || "Restaurant",
        boards: [fallbackBoard],
        activeBoardId: fallbackBoard.id
      };
      return commitState({ restaurants: [fallbackRestaurant], activeRestaurantId: fallbackRestaurant.id });
    }

    const targetRestaurantId = resolveRestaurantId(state, restaurantId);
    const restaurants = state.restaurants.filter((restaurant) => restaurant.id !== targetRestaurantId);
    const activeRestaurantId =
      state.activeRestaurantId === targetRestaurantId ? restaurants[0].id : state.activeRestaurantId;
    return commitState({ restaurants, activeRestaurantId });
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const entry = {
      callback: listener,
      boardId: options.boardId || null,
      restaurantId: options.restaurantId || null
    };
    menuListeners.add(entry);
    return () => menuListeners.delete(entry);
  }

  function subscribeBoards(listener, options = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }
    const entry = { callback: listener, restaurantId: options.restaurantId || null };
    boardListeners.add(entry);
    return () => boardListeners.delete(entry);
  }

  function subscribeRestaurants(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    restaurantListeners.add(listener);
    return () => restaurantListeners.delete(listener);
  }

  function notifyMenuListeners() {
    menuListeners.forEach((listener) => {
      try {
        listener.callback(getMenu(listener.boardId, listener.restaurantId));
      } catch (error) {
        console.error("Menu listener failed", error);
      }
    });
  }

  function notifyBoardListeners() {
    boardListeners.forEach((listener) => {
      try {
        listener.callback(getBoards({ restaurantId: listener.restaurantId }));
      } catch (error) {
        console.error("Board listener failed", error);
      }
    });
  }

  function notifyRestaurantListeners() {
    const snapshot = getRestaurants();
    restaurantListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Restaurant listener failed", error);
      }
    });
  }

  function appendQuery(url, queryString) {
    if (!queryString) {
      return url;
    }
    return url.includes("?") ? `${url}&${queryString}` : `${url}?${queryString}`;
  }

  function sanitizeRemoteText(text = "") {
    return text.replace(/^\)\]\}'/, "").trim();
  }

  function parseRemoteJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(sanitizeRemoteText(text));
    } catch (error) {
      console.warn("Unable to parse response from Google Sheets", error);
      return null;
    }
  }

  function extractPayload(payload) {
    if (!payload) {
      return null;
    }
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch (error) {
        console.warn("Unable to parse payload from string", error);
        return null;
      }
    }
    if (typeof payload.menu === "string") {
      return extractPayload(payload.menu);
    }
    if (typeof payload.menu === "object" && payload.menu !== null) {
      return payload.menu;
    }
    if (typeof payload.data === "object" && payload.data !== null) {
      return payload.data;
    }
    if (typeof payload.result === "object" && payload.result !== null) {
      return payload.result;
    }
    if (typeof payload.body === "object" && payload.body !== null) {
      return payload.body;
    }
    return typeof payload === "object" ? payload : null;
  }

  function withTimeout(controller) {
    if (!controller || !remoteTimeout) {
      return null;
    }
    return setTimeout(() => controller.abort(), remoteTimeout);
  }

  async function remoteFetchState() {
    if (!remoteEnabled) {
      return null;
    }

    const params = new URLSearchParams({ action: remoteGetAction });
    if (remoteToken) {
      params.set("token", remoteToken);
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = withTimeout(controller);
    try {
      const response = await fetch(appendQuery(remoteEndpoint, params.toString()), {
        method: "GET",
        mode: remoteMode,
        signal: controller ? controller.signal : undefined
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Google Sheets fetch failed: ${response.status} ${text}`);
      }
      return normalizeRestaurantsState(extractPayload(parseRemoteJson(text)) || {});
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async function remoteSaveState(state) {
    if (!remoteEnabled) {
      return null;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = withTimeout(controller);
    try {
      const payload = {
        action: remoteSetAction,
        menu: state
      };
      if (remoteToken) {
        payload.token = remoteToken;
      }
      const response = await fetch(remoteEndpoint, {
        method: remoteConfig.method || "POST",
        headers: remoteHeaders,
        body: JSON.stringify(payload),
        mode: remoteMode,
        signal: controller ? controller.signal : undefined
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Google Sheets save failed: ${response.status} ${text}`);
      }
      return normalizeRestaurantsState(extractPayload(parseRemoteJson(text)) || {});
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  function syncFromRemote(options = {}) {
    if (!remoteEnabled) {
      return Promise.resolve(null);
    }
    if (remoteState.inFlight) {
      return remoteState.inFlight;
    }

    const force = Boolean(options.force);
    remoteState.inFlight = remoteFetchState()
      .then((remoteStatePayload) => {
        if (!remoteStatePayload) {
          return null;
        }
        applyExternalState(remoteStatePayload, { force });
        return remoteStatePayload;
      })
      .catch((error) => {
        console.warn("Unable to sync menu from Google Sheets", error);
        return null;
      })
      .finally(() => {
        remoteState.inFlight = null;
      });

    return remoteState.inFlight;
  }

  if (remoteEnabled) {
    syncFromRemote({ force: true });
    setInterval(() => {
      syncFromRemote();
    }, remotePollInterval);
    window.addEventListener("focus", () => {
      syncFromRemote();
    });
    window.addEventListener("online", () => {
      syncFromRemote({ force: true });
    });
  }

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "STATE_UPDATE" || typeof data.payload !== "string") {
        return;
      }
      if (data.payload === lastSerializedState) {
        return;
      }
      try {
        const parsed = JSON.parse(data.payload);
        applyExternalState(parsed, { force: true, broadcast: false, persist: false });
      } catch (error) {
        console.warn("Unable to apply broadcasted menu update", error);
      }
    });
  }

  function isRemoteSyncEnabled() {
    return remoteEnabled;
  }

  window.MenuData = {
    getMenu,
    saveMenu,
    resetMenu,
    subscribe,
    subscribeBoards,
    subscribeRestaurants,
    getBoards,
    setActiveBoard,
    createBoard,
    deleteBoard,
    renameBoard,
    getRestaurants,
    setActiveRestaurant,
    createRestaurant,
    deleteRestaurant,
    renameRestaurant,
    syncNow: () => syncFromRemote({ force: true }),
    isRemoteEnabled: isRemoteSyncEnabled
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || typeof event.newValue !== "string") {
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue);
      applyExternalState(parsed, { force: true, broadcast: false, persist: false });
    } catch (error) {
      console.warn("Unable to process shared menu update", error);
    }
  });
})();
