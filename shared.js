(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const listeners = new Set();
  let cachedMenu = null;
  let memoryMenu = null;
  let lastSerializedMenu = null;
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

  function ensureMemoryMenu() {
    if (!memoryMenu) {
      memoryMenu = normalizeMenu(window.DEFAULT_MENU);
      lastSerializedMenu = JSON.stringify(memoryMenu);
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
      const parsed = normalizeMenu(JSON.parse(raw));
      lastSerializedMenu = JSON.stringify(parsed);
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

  function saveMenu(menu) {
    cachedMenu = normalizeMenu(menu);
    const serialized = JSON.stringify(cachedMenu);
    lastSerializedMenu = serialized;
    memoryMenu = cachedMenu;
    safeSetItem(STORAGE_KEY, serialized);
    notifyListeners();
    if (remoteEnabled) {
      remoteSaveMenu(cachedMenu).catch((error) => {
        console.error("Unable to save menu to Google Sheets", error);
      });
    }
    return getMenu();
  }

  function resetMenu() {
    safeRemoveItem(STORAGE_KEY);
    cachedMenu = normalizeMenu(window.DEFAULT_MENU);
    memoryMenu = cachedMenu;
    lastSerializedMenu = JSON.stringify(cachedMenu);
    notifyListeners();
    if (remoteEnabled) {
      remoteSaveMenu(cachedMenu).catch((error) => {
        console.error("Unable to reset menu in Google Sheets", error);
      });
    }
    return getMenu();
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

  function extractMenu(payload) {
    if (!payload) {
      return null;
    }
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch (error) {
        console.warn("Unable to parse menu payload from string", error);
        return null;
      }
    }
    if (typeof payload.menu === "string") {
      return extractMenu(payload.menu);
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

  async function remoteFetchMenu() {
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
      return extractMenu(parseRemoteJson(text));
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async function remoteSaveMenu(menu) {
    if (!remoteEnabled) {
      return null;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = withTimeout(controller);
    try {
      const payload = {
        action: remoteSetAction,
        menu
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
      return extractMenu(parseRemoteJson(text));
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
    remoteState.inFlight = remoteFetchMenu()
      .then((remoteMenu) => {
        if (!remoteMenu) {
          return null;
        }
        const normalized = normalizeMenu(remoteMenu);
        const serialized = JSON.stringify(normalized);
        if (force || serialized !== lastSerializedMenu) {
          cachedMenu = normalized;
          memoryMenu = normalized;
          lastSerializedMenu = serialized;
          safeSetItem(STORAGE_KEY, serialized);
          notifyListeners();
        }
        return normalized;
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
    syncNow: () => syncFromRemote({ force: true })
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedState = null;
      notifyMenuListeners();
      notifyBoardListeners();
    }
  });
})();
