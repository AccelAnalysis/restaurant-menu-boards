(function () {
  const STORAGE_KEY = "restaurant-menu-data";
  const listeners = new Set();
  let cachedMenu = null;

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

  function readFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeMenu(window.DEFAULT_MENU);
    }

    try {
      return normalizeMenu(JSON.parse(raw));
    } catch (error) {
      console.warn("Unable to parse stored menu data. Falling back to defaults.", error);
      localStorage.removeItem(STORAGE_KEY);
      return normalizeMenu(window.DEFAULT_MENU);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedMenu));
    notifyListeners();
    return getMenu();
  }

  function resetMenu() {
    localStorage.removeItem(STORAGE_KEY);
    cachedMenu = normalizeMenu(window.DEFAULT_MENU);
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
