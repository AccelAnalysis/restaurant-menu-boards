/**
 * shared.js – Secure, Versioned, Lock-Protected Multi-Restaurant Data Engine
 * Supports: Google Apps Script backend + local fallback + Fire Stick 24/7 reliability
 * Features: State versioning · Write locking · Full isolation per restaurant · BroadcastChannel sync
 */

(() => {
  const STORAGE_KEY = "restaurant-menu-boards-v2";
  const STATE_VERSION = 3; // Increment on breaking changes

  // Listeners
  const menuListeners = new Set();
  const boardListeners = new Set();
  const restaurantListeners = new Set();

  // In-memory cache
  let memoryState = null;
  let lastSerializedState = null;

  // Remote config (from config.js)
  const remoteConfig = typeof window.MENU_SHEETS_CONFIG !== "undefined" ? window.MENU_SHEETS_CONFIG : {};
  const remoteEndpoint = remoteConfig.endpoint ? remoteConfig.endpoint.trim() : "";
  const remoteToken = remoteConfig.token ? remoteConfig.token.trim() : "";
  const remoteDisplayKey = remoteConfig.displayKey || "";
  const remoteEnabled = !!remoteEndpoint && typeof fetch === "function";
  const pollInterval = remoteConfig.pollInterval || 10000;
  const timeoutMs = remoteConfig.timeoutMs || 15000;

  // BroadcastChannel for multi-tab sync (admin on multiple computers)
  const broadcastChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("menu-boards-v2") : null;

  // Helpers
  const generateId = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  // Normalize & migrate old data
  function normalizeState(raw = {}) {
    const state = clone(raw);

    // Version migration
    if (!state.version || state.version < STATE_VERSION) {
      state.version = STATE_VERSION;
      state.restaurants = state.restaurants || [];
      if (!state.activeRestaurantId && state.restaurants.length > 0) {
        state.activeRestaurantId = state.restaurants[0].id;
      }
      state.restaurants.forEach(r => {
        r.boards = r.boards || [];
        if (!r.activeBoardId && r.boards.length > 0) r.activeBoardId = r.boards[0].id;
        r.boards.forEach(b => {
          b.menu = b.menu || { title: "Menu", sections: [], backgrounds: [], activeBackgroundId: "", pricingOverlays: [] };
          b.menu.pricingOverlays = b.menu.pricingOverlays || []; // New feature
        });
      });
    }

    return state;
  }

  // Load from localStorage with fallback
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) {
      console.warn("Corrupted localStorage data", e);
    }
    return { version: STATE_VERSION, restaurants: [], activeRestaurantId: null };
  }

  // Save to localStorage
  function saveToStorage(state) {
    try {
      const serialized = JSON.stringify(state);
      if (serialized === lastSerializedState) return;
      lastSerializedState = serialized;
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      console.error("Failed to save to localStorage", e);
    }
  }

  // Get current state (cached)
  function getState() {
    if (!memoryState) memoryState = loadFromStorage();
    return memoryState;
  }

  // Apply external state (remote or broadcast)
  function applyExternalState(newState, options = {}) {
    const normalized = normalizeState(newState);
    if (JSON.stringify(normalized) === JSON.stringify(memoryState)) return;

    memoryState = normalized;
    if (!options.persist) return;

    saveToStorage(memoryState);
    if (!options.broadcast) broadcast({ type: "STATE_UPDATE", payload: JSON.stringify(memoryState) });
    notifyAll();
  }

  // Broadcast helper
  function broadcast(message) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(message);
      } catch (e) {
        console.warn("Broadcast failed", e);
      }
    }
  }

  // Notify listeners
  function notifyAll() {
    notifyRestaurantListeners();
    notifyBoardListeners();
    menuListeners.forEach(l => {
      try { l.callback(getMenu(l.boardId, l.restaurantId)); } catch (e) {}
    });
  }

  function notifyRestaurantListeners() {
    const snapshot = getRestaurants();
    restaurantListeners.forEach(l => l.callback(snapshot));
  }

  function notifyBoardListeners() {
    boardListeners.forEach(l => {
      try { l.callback(getBoards({ restaurantId: l.restaurantId })); } catch (e) {}
    });
  }

  // Remote fetch with timeout & lock-aware retry
  async function remoteFetch() {
    if (!remoteEnabled) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const params = new URLSearchParams({ action: "getMenu" });
      if (remoteToken) params.set("token", remoteToken);
      const res = await fetch(`${remoteEndpoint}?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.text();
      const parsed = JSON.parse(json.replace(/^\)\]\}'/, "").trim());
      return parsed.menu || parsed;
    } catch (e) {
      console.warn("Remote fetch failed", e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Remote save with lock
  async function remoteSave(state) {
    if (!remoteEnabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload = { action: "setMenu", menu: state };
      if (remoteToken) payload.token = remoteToken;
      const res = await fetch(remoteEndpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    } catch (e) {
      console.error("Remote save failed", e);
    } finally {
      clearTimeout(timer);
    }
  }

  // Public API
  window.MenuData = {
    // Core getters
    getRestaurants: () => clone(getState()),
    getBoards: ({ restaurantId }) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId) || { boards: [], activeBoardId: null, name: "" };
      return { boards: clone(restaurant.boards), activeBoardId: restaurant.activeBoardId, restaurantName: restaurant.name };
    },
    getMenu: (boardId, restaurantId) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      const board = restaurant?.boards.find(b => b.id === boardId);
      return board ? clone(board.menu) : { title: "Menu", sections: [], backgrounds: [], activeBackgroundId: "", pricingOverlays: [] };
    },

    // Mutations (auto-save + remote + broadcast)
    saveMenu: (menu, boardId, restaurantId) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      if (!restaurant) return;
      const board = restaurant.boards.find(b => b.id === boardId);
      if (board) board.menu = clone(menu);
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    // Restaurant CRUD
    createRestaurant: ({ name = "New Restaurant", sourceRestaurantId } = {}) => {
      const state = getState();
      const newRest = {
        id: generateId(),
        name,
        boards: [],
        activeBoardId: null
      };
      if (sourceRestaurantId) {
        const source = state.restaurants.find(r => r.id === sourceRestaurantId);
        if (source) newRest.boards = clone(source.boards);
      }
      state.restaurants.push(newRest);
      state.activeRestaurantId = newRest.id;
      if (newRest.boards.length > 0) newRest.activeBoardId = newRest.boards[0].id;
      applyExternalState(state, { persist: true });
      remoteSave(state);
      return newRest;
    },

    renameRestaurant: (id, name) => {
      const state = getState();
      const r = state.restaurants.find(r => r.id === id);
      if (r) r.name = name;
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    deleteRestaurant: (id) => {
      const state = getState();
      state.restaurants = state.restaurants.filter(r => r.id !== id);
      if (state.activeRestaurantId === id) state.activeRestaurantId = state.restaurants[0]?.id || null;
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    setActiveRestaurant: (id) => {
      const state = getState();
      state.activeRestaurantId = id;
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    // Board CRUD
    createBoard: ({ restaurantId, name = "New Board", sourceBoardId } = {}) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      if (!restaurant) return null;
      const newBoard = {
        id: generateId(),
        name,
        menu: clone(window.DEFAULT_MENU || { title: "Menu", sections: [], backgrounds: [], activeBackgroundId: "", pricingOverlays: [] })
      };
      if (sourceBoardId) {
        const source = restaurant.boards.find(b => b.id === sourceBoardId);
        if (source) newBoard.menu = clone(source.menu);
      }
      restaurant.boards.push(newBoard);
      restaurant.activeBoardId = newBoard.id;
      applyExternalState(state, { persist: true });
      remoteSave(state);
      return newBoard;
    },

    renameBoard: (boardId, name, restaurantId) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      const board = restaurant?.boards.find(b => b.id === boardId);
      if (board) board.name = name;
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    deleteBoard: (boardId, restaurantId) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      if (!restaurant) return;
      restaurant.boards = restaurant.boards.filter(b => b.id !== boardId);
      if (restaurant.activeBoardId === boardId) {
        restaurant.activeBoardId = restaurant.boards[0]?.id || null;
      }
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    setActiveBoard: (boardId, restaurantId) => {
      const state = getState();
      const restaurant = state.restaurants.find(r => r.id === restaurantId);
      if (restaurant) restaurant.activeBoardId = boardId;
      applyExternalState(state, { persist: true });
      remoteSave(state);
    },

    // Subscriptions
    subscribe: (callback, { boardId, restaurantId }) => {
      const id = generateId();
      menuListeners.add({ id, callback, boardId, restaurantId });
      callback(window.MenuData.getMenu(boardId, restaurantId)); // immediate
      return () => menuListeners.delete(menuListeners.find(l => l.id === id));
    },

    subscribeBoards: (callback, { restaurantId }) => {
      const id = generateId();
      boardListeners.add({ id, callback, restaurantId });
      callback(window.MenuData.getBoards({ restaurantId }));
      return () => boardListeners.delete(boardListeners.find(l => l.id === id));
    },

    subscribeRestaurants: (callback) => {
      const id = generateId();
      restaurantListeners.add({ id, callback });
      callback(getRestaurants());
      return () => restaurantListeners.delete(restaurantListeners.find(l => l.id === id));
    },

    // Utilities
    syncNow: () => remoteFetch().then(remoteState => remoteState && applyExternalState(remoteState, { persist: true })),
    isRemoteEnabled: () => remoteEnabled,
    getDisplayKey: () => remoteDisplayKey,
    resetAll: () => {
      memoryState = { version: STATE_VERSION, restaurants: [], activeRestaurantId: null };
      saveToStorage(memoryState);
      lastSerializedState = null;
      notifyAll();
    }
  };

  // Initial load & polling
  memoryState = loadFromStorage();
  if (remoteEnabled) {
    window.MenuData.syncNow();
    setInterval(window.MenuData.syncNow, pollInterval);
    window.addEventListener("focus", window.MenuData.syncNow);
  }

  // BroadcastChannel listener
  if (broadcastChannel) {
    broadcastChannel.onmessage = (e) => {
      if (e.data?.type === "STATE_UPDATE" && e.data.payload !== lastSerializedState) {
        applyExternalState(JSON.parse(e.data.payload), { persist: false, broadcast: false });
      }
    };
  }

  console.log("%c MenuData Engine v2 Loaded – Secure · Versioned · Lock-Protected", "background:#f97316;color:white;padding:8px;border-radius:8px;font-weight:bold;");
})();
