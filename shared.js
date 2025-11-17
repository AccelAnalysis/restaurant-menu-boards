(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const menuListeners = new Set();
  const boardListeners = new Set();
  const restaurantListeners = new Set();
  let cachedState = null;
  let memoryState = null;
  let storageEnabled = typeof window !== "undefined" && "localStorage" in window;

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
      description:
        typeof section.description === "string" ? section.description : "",
      items: Array.isArray(section.items)
        ? section.items.map(normalizeItem)
        : []
    };
  }

  function normalizeMenu(menu = {}) {
    const source = typeof menu === "object" && menu !== null ? menu : {};
    const fallback =
      typeof window.DEFAULT_MENU === "object" && window.DEFAULT_MENU
        ? window.DEFAULT_MENU
        : { title: "Menu", sections: [] };

    return {
      title: typeof source.title === "string" && source.title.trim()
        ? source.title
        : fallback.title || "Menu",
      subtitle: typeof source.subtitle === "string" ? source.subtitle : fallback.subtitle || "",
      sections: Array.isArray(source.sections) && source.sections.length
        ? source.sections.map(normalizeSection)
        : (fallback.sections || []).map(normalizeSection)
    };
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
    return memoryState;
  }

  function readFromStorage() {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) {
      return ensureMemoryState();
    }

    try {
      return normalizeRestaurantsState(JSON.parse(raw));
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
  }

  function notifyMenuListeners() {
    menuListeners.forEach((listener) => {
      try {
        listener.callback(
          getMenu(listener.boardId, { restaurantId: listener.restaurantId })
        );
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
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedState = null;
      notifyMenuListeners();
      notifyBoardListeners();
      notifyRestaurantListeners();
    }
  });
})();
