(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const menuListeners = new Set();
  const boardListeners = new Set();
  let cachedState = null;
  let memoryState = null;
  let storageEnabled = typeof window !== "undefined" && "localStorage" in window;

  function clone(object) {
    return JSON.parse(JSON.stringify(object));
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
      id: generateId(),
      name: name || normalizedMenu.title || "Menu Board",
      menu: normalizedMenu
    };
  }

  function normalizeBoardsState(state) {
    const fallbackBoard = createBoardFromMenu(window.DEFAULT_MENU, "Main Board");

    if (!state || typeof state !== "object") {
      return { boards: [fallbackBoard], activeBoardId: fallbackBoard.id };
    }

    // Handle legacy single menu objects
    if (!Array.isArray(state.boards)) {
      const legacyBoard = createBoardFromMenu(state, state.title || "Main Board");
      return { boards: [legacyBoard], activeBoardId: legacyBoard.id };
    }

    const boards = state.boards
      .map((board, index) => {
        if (!board || typeof board !== "object") {
          return null;
        }
        const id = typeof board.id === "string" ? board.id : generateId() + index;
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

  function ensureMemoryState() {
    if (!memoryState) {
      memoryState = normalizeBoardsState({});
    }
    return memoryState;
  }

  function readFromStorage() {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) {
      return ensureMemoryState();
    }

    try {
      return normalizeBoardsState(JSON.parse(raw));
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

  function getMenu(boardId) {
    const state = getState();
    const targetBoard = boardId
      ? state.boards.find((board) => board.id === boardId)
      : state.boards.find((board) => board.id === state.activeBoardId);
    const fallbackBoard = state.boards[0];
    return clone((targetBoard || fallbackBoard).menu);
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

  function notifyMenuListeners() {
    menuListeners.forEach((listener) => {
      try {
        listener.callback(getMenu(listener.boardId));
      } catch (error) {
        console.error("Menu listener failed", error);
      }
    });
  }

  function notifyBoardListeners() {
    const snapshot = getBoards();
    boardListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Board listener failed", error);
      }
    });
  }

  function saveState(state) {
    cachedState = normalizeBoardsState(state);
    const serialized = JSON.stringify(cachedState);
    memoryState = cachedState;
    safeSetItem(STORAGE_KEY, serialized);
    notifyMenuListeners();
    notifyBoardListeners();
    return getState();
  }

  function updateBoard(boardId, updater) {
    const state = getState();
    const board = state.boards.find((entry) => entry.id === boardId);
    if (!board) {
      return state;
    }
    updater(board);
    return saveState(state);
  }

  function saveMenu(menu, boardId) {
    const targetBoardId = boardId || getState().activeBoardId;
    updateBoard(targetBoardId, (board) => {
      board.menu = normalizeMenu(menu);
    });
    return getMenu(targetBoardId);
  }

  function resetMenu(boardId) {
    const targetBoardId = boardId || getState().activeBoardId;
    updateBoard(targetBoardId, (board) => {
      board.menu = normalizeMenu(window.DEFAULT_MENU);
    });
    return getMenu(targetBoardId);
  }

  function createBoard(options = {}) {
    const { name, sourceBoardId } = options;
    const state = getState();
    let templateMenu = window.DEFAULT_MENU;
    let sourceBoard = null;
    if (sourceBoardId) {
      sourceBoard = state.boards.find((board) => board.id === sourceBoardId) || null;
      if (sourceBoard) {
        templateMenu = sourceBoard.menu;
      }
    }
    const boardName = name || (sourceBoard ? `${sourceBoard.name} Copy` : "New Board");
    const newBoard = createBoardFromMenu(templateMenu, boardName);
    state.boards.push(newBoard);
    state.activeBoardId = newBoard.id;
    saveState(state);
    return { id: newBoard.id, name: newBoard.name };
  }

  function renameBoard(boardId, newName) {
    const trimmedName = typeof newName === "string" ? newName.trim() : "";
    updateBoard(boardId, (board) => {
      board.name = trimmedName || board.name;
    });
  }

  function deleteBoard(boardId) {
    const state = getState();
    if (state.boards.length <= 1) {
      return state;
    }
    const remainingBoards = state.boards.filter((board) => board.id !== boardId);
    if (!remainingBoards.length) {
      return state;
    }
    state.boards = remainingBoards;
    if (state.activeBoardId === boardId) {
      state.activeBoardId = remainingBoards[0].id;
    }
    return saveState(state);
  }

  function setActiveBoard(boardId) {
    const state = getState();
    if (!state.boards.some((board) => board.id === boardId)) {
      return state;
    }
    state.activeBoardId = boardId;
    return saveState(state);
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      return () => {};
    }

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

  window.MenuData = {
    getMenu,
    saveMenu,
    resetMenu,
    subscribe,
    subscribeBoards,
    getBoards,
    createBoard,
    renameBoard,
    deleteBoard,
    setActiveBoard
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedState = null;
      notifyMenuListeners();
      notifyBoardListeners();
    }
  });
})();
