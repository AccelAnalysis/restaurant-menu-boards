(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const listeners = new Set();
  let cachedMenu = null;
  let memoryMenu = null;
  let storageEnabled = typeof window !== "undefined" && "localStorage" in window;

  function clone(object) {
    return JSON.parse(JSON.stringify(object));
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
    }
    return memoryMenu;
  }

  function readFromStorage() {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) {
      return ensureMemoryMenu();
    }

    try {
      return normalizeMenu(JSON.parse(raw));
    } catch (error) {
      console.warn("Unable to parse stored menu data. Falling back to defaults.", error);
      safeRemoveItem(STORAGE_KEY);
      return ensureMemoryMenu();
    }
  }

  function getMenu() {
    if (!cachedMenu) {
      cachedMenu = readFromStorage();
    }

    return clone(cachedMenu);
  }

  function notifyListeners() {
    const snapshot = getMenu();
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Menu listener failed", error);
      }
    });
  }

  function saveMenu(menu) {
    cachedMenu = normalizeMenu(menu);
    const serialized = JSON.stringify(cachedMenu);
    memoryMenu = cachedMenu;
    safeSetItem(STORAGE_KEY, serialized);
    notifyListeners();
    return getMenu();
  }

  function resetMenu() {
    safeRemoveItem(STORAGE_KEY);
    cachedMenu = normalizeMenu(window.DEFAULT_MENU);
    memoryMenu = cachedMenu;
    notifyListeners();
    return getMenu();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.MenuData = {
    getMenu,
    saveMenu,
    resetMenu,
    subscribe
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedMenu = null;
      notifyListeners();
    }
  });
})();
