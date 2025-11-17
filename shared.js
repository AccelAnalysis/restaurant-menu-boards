(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const menuListeners = new Set();
  const boardListeners = new Set();
  const restaurantListeners = new Set();
  let cachedState = null;
  let memoryState = null;
  const STORAGE_KEY = "restaurant-menu-boards";
  const menuListeners = new Set();
  const boardListeners = new Set();
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

  function clone(object) {
    return JSON.parse(JSON.stringify(object));
  }

  function generateBoardId() {
    return "board-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  }

  function generateRestaurantId() {
    return (
      "restaurant-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36)
    );
  }

  function generateId() {
    return "board-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  }

  function normalizeItem(item = {}) {
    return {
      name: typeof item.name === "string" ? item.name : "Unnamed Item",
      description: typeof item.description === "string" ? item.description : "",
      price:
        typeof item.price === "number" || typeof item.price === "string"
          ? String(item.price)
          : ""
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

  function createBoardFromMenu(menu, name) {
    const normalizedMenu = normalizeMenu(menu);
    return {
      id: generateBoardId(),
      name: name || normalizedMenu.title || "Menu Board",
      menu: normalizedMenu
    };
  }

  function duplicateBoards(boards = []) {
    return boards.map((board) => createBoardFromMenu(board.menu, board.name));
  }

  function buildDefaultRestaurant(name = "Restaurant") {
    const board = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");
    const resolvedName = typeof name === "string" && name.trim() ? name.trim() : name || "Restaurant";
    return {
      id: generateRestaurantId(),
      name: resolvedName,
      boards: [board],
      activeBoardId: board.id
    };
  }

  function normalizeBoardsState(state) {
    const fallbackBoard = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");

    if (!state || typeof state !== "object") {
      return { boards: [fallbackBoard], activeBoardId: fallbackBoard.id };
    }

    if (!Array.isArray(state.boards)) {
      const legacyBoard = createBoardFromMenu(state, state.title || "Main Board");
      return { boards: [legacyBoard], activeBoardId: legacyBoard.id };
    }

    const boards = state.boards
      .map((board, index) => {
        if (!board || typeof board !== "object") {
          return null;
        }
        const id = typeof board.id === "string" ? board.id : generateBoardId() + index;
        const name = typeof board.name === "string" && board.name.trim()
          ? board.name
          : `Board ${index + 1}`;
        const menu = normalizeMenu(board.menu);
        return { id, name, menu };
      })
      .filter(Boolean);

    if (!boards.length) {
      boards.push(fallbackBoard);
    }

    const activeBoardId = boards.some((board) => board.id === state.activeBoardId)
      ? state.activeBoardId
      : boards[0].id;

    return { boards, activeBoardId };
  }

  function normalizeRestaurantsState(state) {
    const defaultRestaurant = buildDefaultRestaurant("Flagship Restaurant");

    if (!state || typeof state !== "object") {
      return { restaurants: [defaultRestaurant], activeRestaurantId: defaultRestaurant.id };
    }

    if (!Array.isArray(state.restaurants)) {
      const legacyBoards = normalizeBoardsState(state);
      const restaurant = {
        id: generateRestaurantId(),
        name:
          typeof state.restaurantName === "string" && state.restaurantName.trim()
            ? state.restaurantName
            : "Restaurant 1",
        boards: legacyBoards.boards,
        activeBoardId: legacyBoards.activeBoardId
      };
      return { restaurants: [restaurant], activeRestaurantId: restaurant.id };
    }

    const restaurants = state.restaurants
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const normalizedBoards = normalizeBoardsState(entry);
        const id = typeof entry.id === "string" ? entry.id : generateRestaurantId() + index;
        const name = typeof entry.name === "string" && entry.name.trim()
          ? entry.name
          : `Restaurant ${index + 1}`;
        return {
          id,
          name,
          boards: normalizedBoards.boards,
          activeBoardId: normalizedBoards.activeBoardId
        };
      })
      .filter(Boolean);

    if (!restaurants.length) {
      restaurants.push(defaultRestaurant);
    }

    const activeRestaurantId = restaurants.some((restaurant) => restaurant.id === state.activeRestaurantId)
      ? state.activeRestaurantId
      : restaurants[0].id;

    return { restaurants, activeRestaurantId };
  }

  function ensureMemoryState() {
    if (!memoryState) {
      memoryState = normalizeRestaurantsState({});
    }
  function ensureMemoryState() {
    if (!memoryState) {
      memoryState = normalizeBoardsState({});
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
      return normalizeRestaurantsState(JSON.parse(raw));
      const parsed = normalizeBoardsState(JSON.parse(raw));
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

  function resolveBoardId(state, requestedId) {
    if (requestedId && state.boards.some((board) => board.id === requestedId)) {
      return requestedId;
    }
    return state.activeBoardId;
  }

  function commitState(nextState) {
    const normalized = normalizeBoardsState(nextState);
    const serialized = JSON.stringify(normalized);
    cachedState = clone(normalized);
    memoryState = normalized;
    lastSerializedState = serialized;
    safeSetItem(STORAGE_KEY, serialized);
    notifyBoardListeners();
    notifyMenuListeners();
    if (remoteEnabled) {
      remoteSaveState(normalized).catch((error) => {
        console.error("Unable to save menu to Google Sheets", error);
      });
    }
    return getState();
  }

  function getMenu(boardId) {
    const state = getState();
    const targetBoardId = resolveBoardId(state, boardId);
    const targetBoard = state.boards.find((board) => board.id === targetBoardId) || state.boards[0];
    return clone(targetBoard.menu);
  }

  function getBoards(options = {}) {
    const { withMenus = false } = options;
    const state = getState();
    return {
      activeBoardId: state.activeBoardId,
      boards: state.boards.map((board) => {
        const payload = { id: board.id, name: board.name };
        if (withMenus) {
          payload.menu = clone(board.menu);
        }
        return payload;
      })
    };
  }

  function saveMenu(menu, boardId) {
    const normalizedMenu = normalizeMenu(menu);
    const state = getState();
    const targetBoardId = resolveBoardId(state, boardId);
    const boards = state.boards.map((board) =>
      board.id === targetBoardId ? { ...board, menu: normalizedMenu } : board
    );
    commitState({ ...state, boards });
    return getMenu(targetBoardId);
  }

  function resetMenu(boardId) {
    return saveMenu(window.DEFAULT_MENU, boardId);
  }

  function setActiveBoard(boardId) {
    const state = getState();
    if (!state.boards.some((board) => board.id === boardId)) {
      return state;
    }
    if (state.activeBoardId === boardId) {
      return state;
    }
    return commitState({ ...state, activeBoardId: boardId });
  }

  function getState() {
    if (!cachedState) {
      cachedState = readFromStorage();
  function renameBoard(boardId, name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const state = getState();
    const boards = state.boards.map((board) =>
      board.id === boardId && trimmed ? { ...board, name: trimmed } : board
    );
    commitState({ ...state, boards });
  }

  function createBoard(options = {}) {
    const state = getState();
    const sourceBoard = options.sourceBoardId
      ? state.boards.find((board) => board.id === options.sourceBoardId)
      : null;
    const name =
      typeof options.name === "string" && options.name.trim()
        ? options.name.trim()
        : sourceBoard
          ? `${sourceBoard.name} Copy`
          : `Board ${state.boards.length + 1}`;
    const menu = sourceBoard ? clone(sourceBoard.menu) : normalizeMenu(window.DEFAULT_MENU);
    const newBoard = { id: generateId(), name, menu };
    commitState({ boards: [...state.boards, newBoard], activeBoardId: newBoard.id });
    return newBoard;
  }

  function deleteBoard(boardId) {
    const state = getState();
    if (state.boards.length <= 1) {
      const fallback = createBoardFromMenu(window.DEFAULT_MENU, "Main Board", state.boards[0].id);
      return commitState({ boards: [fallback], activeBoardId: fallback.id });
    }

    const targetBoardId = resolveBoardId(state, boardId);
    const boards = state.boards.filter((board) => board.id !== targetBoardId);
    const activeBoardId = state.activeBoardId === targetBoardId ? boards[0].id : state.activeBoardId;
    return commitState({ boards, activeBoardId });
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }
    return clone(cachedState);
  }

  function resolveRestaurant(state, restaurantId) {
    if (!state.restaurants || !state.restaurants.length) {
      const normalized = normalizeRestaurantsState({});
      state.restaurants = normalized.restaurants;
      state.activeRestaurantId = normalized.activeRestaurantId;
    }

    const targetRestaurantId =
      restaurantId && state.restaurants.some((entry) => entry.id === restaurantId)
        ? restaurantId
        : state.restaurants.some((entry) => entry.id === state.activeRestaurantId)
          ? state.activeRestaurantId
          : state.restaurants[0].id;

    const restaurant = state.restaurants.find((entry) => entry.id === targetRestaurantId) || state.restaurants[0];

    if (!restaurant.boards || !restaurant.boards.length) {
      const fallback = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");
      restaurant.boards = [fallback];
      restaurant.activeBoardId = fallback.id;
    }

    state.activeRestaurantId = restaurant.id;
    return { restaurant, id: restaurant.id };
  }

  function getMenu(boardId, options = {}) {
    const state = getState();
    const { restaurant } = resolveRestaurant(state, options.restaurantId);
    const targetBoard = boardId
      ? restaurant.boards.find((board) => board.id === boardId)
      : restaurant.boards.find((board) => board.id === restaurant.activeBoardId);
    const fallbackBoard = restaurant.boards[0];
    const menu = (targetBoard || fallbackBoard || {}).menu || window.DEFAULT_MENU;
    return clone(menu);
  }

  function getBoards(options = {}) {
    const { withMenus = false, restaurantId } = options;
    const state = getState();
    const { restaurant, id } = resolveRestaurant(state, restaurantId);
    return {
      restaurantId: id,
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

  function getRestaurants() {
    const state = getState();
    return {
      activeRestaurantId: state.activeRestaurantId,
      restaurants: state.restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        boardCount: restaurant.boards.length
      }))
    };
    const entry = { callback: listener, boardId: options.boardId || null };
    menuListeners.add(entry);
    return () => menuListeners.delete(entry);
  }

  function subscribeBoards(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    boardListeners.add(listener);
    return () => boardListeners.delete(listener);
  }

  function notifyMenuListeners() {
    menuListeners.forEach((listener) => {
      try {
        listener.callback(
          getMenu(listener.boardId, { restaurantId: listener.restaurantId })
        );
        listener.callback(getMenu(listener.boardId));
      } catch (error) {
        console.error("Menu listener failed", error);
      }
    });
  }

  function notifyBoardListeners() {
    boardListeners.forEach((listener) => {
      try {
        listener.callback(getBoards({ restaurantId: listener.restaurantId }));
    const snapshot = getBoards();
    boardListeners.forEach((listener) => {
      try {
        listener.callback(
          getMenu(listener.boardId, { restaurantId: listener.restaurantId })
        );
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

  function saveState(state) {
    cachedState = normalizeRestaurantsState(state);
    const serialized = JSON.stringify(cachedState);
    memoryState = cachedState;
    safeSetItem(STORAGE_KEY, serialized);
    notifyMenuListeners();
    notifyBoardListeners();
    notifyRestaurantListeners();
    return getState();
  }

  function updateBoard(boardId, updater, options = {}) {
    const state = getState();
    const { restaurant } = resolveRestaurant(state, options.restaurantId);
    const targetBoardId = boardId || restaurant.activeBoardId;
    const board = restaurant.boards.find((entry) => entry.id === targetBoardId);
    if (!board) {
      return state;
    }
    updater(board, restaurant);
    restaurant.activeBoardId = board.id;
    state.activeRestaurantId = restaurant.id;
    return saveState(state);
  }

  function saveMenu(menu, boardId, options = {}) {
    updateBoard(
      boardId,
      (board) => {
        board.menu = normalizeMenu(menu);
      },
      { restaurantId: options.restaurantId }
    );
    const targetBoards = getBoards({ restaurantId: options.restaurantId });
    const nextBoardId = boardId || targetBoards.activeBoardId;
    return getMenu(nextBoardId, { restaurantId: options.restaurantId });
  }

  function resetMenu(boardId, options = {}) {
    updateBoard(
      boardId,
      (board) => {
        board.menu = normalizeMenu(window.DEFAULT_MENU);
      },
      { restaurantId: options.restaurantId }
    );
    const targetBoards = getBoards({ restaurantId: options.restaurantId });
    const nextBoardId = boardId || targetBoards.activeBoardId;
    return getMenu(nextBoardId, { restaurantId: options.restaurantId });
  }

  function createBoard(options = {}) {
    const { name, sourceBoardId, restaurantId } = options;
    const state = getState();
    const { restaurant } = resolveRestaurant(state, restaurantId);
    let templateMenu = window.DEFAULT_MENU;
    let sourceBoard = null;
    if (sourceBoardId) {
      sourceBoard = restaurant.boards.find((board) => board.id === sourceBoardId) || null;
      if (sourceBoard) {
        templateMenu = sourceBoard.menu;
      }
    }
    const boardName = name || (sourceBoard ? `${sourceBoard.name} Copy` : `Board ${restaurant.boards.length + 1}`);
    const newBoard = createBoardFromMenu(templateMenu, boardName);
    restaurant.boards.push(newBoard);
    restaurant.activeBoardId = newBoard.id;
    state.activeRestaurantId = restaurant.id;
    saveState(state);
    return { id: newBoard.id, name: newBoard.name };
  }

  function renameBoard(boardId, newName, options = {}) {
    const trimmedName = typeof newName === "string" ? newName.trim() : "";
    updateBoard(
      boardId,
      (board) => {
        board.name = trimmedName || board.name;
      },
      { restaurantId: options.restaurantId }
    );
  }

  function deleteBoard(boardId, options = {}) {
    const state = getState();
    const { restaurant } = resolveRestaurant(state, options.restaurantId);
    if (restaurant.boards.length <= 1) {
      return state;
    }
    const remainingBoards = restaurant.boards.filter((board) => board.id !== boardId);
    if (!remainingBoards.length) {
      return state;
    }
    restaurant.boards = remainingBoards;
    if (restaurant.activeBoardId === boardId) {
      restaurant.activeBoardId = remainingBoards[0].id;
    }
    state.activeRestaurantId = restaurant.id;
    return saveState(state);
  }

  function setActiveBoard(boardId, options = {}) {
    const state = getState();
    const { restaurant } = resolveRestaurant(state, options.restaurantId);
    if (!restaurant.boards.some((board) => board.id === boardId)) {
      return state;
    }
    restaurant.activeBoardId = boardId;
    state.activeRestaurantId = restaurant.id;
    return saveState(state);
  }

  function createRestaurant(options = {}) {
    const state = getState();
    const requestedName = typeof options.name === "string" ? options.name.trim() : "";
    let templateBoards = null;

    let templateActiveBoardId = null;

    if (options.sourceRestaurantId) {
      const source = state.restaurants.find((entry) => entry.id === options.sourceRestaurantId);
      if (source) {
        templateBoards = duplicateBoards(source.boards);
        const sourceActiveIndex = source.boards.findIndex((board) => board.id === source.activeBoardId);
        const activeIndex = sourceActiveIndex >= 0 ? sourceActiveIndex : 0;
        templateActiveBoardId = templateBoards[activeIndex] ? templateBoards[activeIndex].id : null;
      }
    }

    const ordinal = state.restaurants.length + 1;
    const resolvedName = requestedName || `Restaurant ${ordinal}`;

    let restaurant;
    if (templateBoards && templateBoards.length) {
      restaurant = {
        id: generateRestaurantId(),
        name: resolvedName,
        boards: templateBoards,
        activeBoardId: templateActiveBoardId || templateBoards[0].id
      };
    } else {
      restaurant = buildDefaultRestaurant(resolvedName);
    }

    state.restaurants.push(restaurant);
    state.activeRestaurantId = restaurant.id;
    saveState(state);
    return { id: restaurant.id, name: restaurant.name };
  }

  function renameRestaurant(restaurantId, newName) {
    const state = getState();
    const trimmedName = typeof newName === "string" ? newName.trim() : "";
    const { restaurant } = resolveRestaurant(state, restaurantId);
    restaurant.name = trimmedName || restaurant.name;
    saveState(state);
  }

  function deleteRestaurant(restaurantId) {
    const state = getState();
    if (state.restaurants.length <= 1) {
      return state;
    }
    const remaining = state.restaurants.filter((restaurant) => restaurant.id !== restaurantId);
    if (!remaining.length) {
      return state;
    }
    state.restaurants = remaining;
    if (state.activeRestaurantId === restaurantId) {
      state.activeRestaurantId = remaining[0].id;
    }
    return saveState(state);
  }

  function setActiveRestaurant(restaurantId) {
    const state = getState();
    if (!state.restaurants.some((restaurant) => restaurant.id === restaurantId)) {
      return state;
    }
    state.activeRestaurantId = restaurantId;
    return saveState(state);
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
      return normalizeBoardsState(extractPayload(parseRemoteJson(text)) || {});
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
      return normalizeBoardsState(extractPayload(parseRemoteJson(text)) || {});
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
        const serialized = JSON.stringify(remoteStatePayload);
        if (force || serialized !== lastSerializedState) {
          cachedState = clone(remoteStatePayload);
          memoryState = remoteStatePayload;
          lastSerializedState = serialized;
          safeSetItem(STORAGE_KEY, serialized);
          notifyBoardListeners();
          notifyMenuListeners();
        }
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

  window.MenuData = {
    getMenu,
    saveMenu,
    resetMenu,
    subscribe,
    subscribeBoards,
    subscribeRestaurants,
    getBoards,
    getRestaurants,
    createBoard,
    renameBoard,
    deleteBoard,
    setActiveBoard,
    createRestaurant,
    renameRestaurant,
    deleteRestaurant,
    setActiveRestaurant
    getBoards,
    setActiveBoard,
    createBoard,
    deleteBoard,
    renameBoard,
    syncNow: () => syncFromRemote({ force: true })
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedState = null;
      notifyMenuListeners();
      notifyBoardListeners();
      notifyRestaurantListeners();
      notifyBoardListeners();
      notifyMenuListeners();
    }
  });
})();
