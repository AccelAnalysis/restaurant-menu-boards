document.addEventListener("DOMContentLoaded", () => {
  const titleElement = document.querySelector("[data-menu-title]");
  const subtitleElement = document.querySelector("[data-menu-subtitle]");
  const updatedElement = document.querySelector("[data-menu-updated]");
  const sectionsContainer = document.querySelector("[data-menu-sections]");
  const menuBody = document.querySelector(".menu-body");
  const boardLabelElement = document.querySelector("[data-board-label]");
  const boardToggleButton = document.querySelector("[data-board-toggle]");

  if (!titleElement || !sectionsContainer) {
    console.error("Display markup is missing required elements.");
    return;
  }

  const restaurantsState = window.MenuData.getRestaurants();
  const params = new URLSearchParams(window.location.search);
  const requestedRestaurantId = params.get("restaurant");
  const requestedBoardId = params.get("board");
  let displayRestaurantId = restaurantsState.restaurants.some(
    (restaurant) => restaurant.id === requestedRestaurantId
  )
    ? requestedRestaurantId
    : restaurantsState.activeRestaurantId;
  let boardsState = window.MenuData.getBoards({ restaurantId: displayRestaurantId });
  let displayBoardId = boardsState.boards.some((board) => board.id === requestedBoardId)
    ? requestedBoardId
    : boardsState.activeBoardId;
  let unsubscribeMenu = null;
  let unsubscribeBoards = null;

  function updateBoardLabel(state = boardsState) {
    if (!boardLabelElement || !state) {
      return;
    }
    const board = state.boards.find((entry) => entry.id === displayBoardId);
    const labelParts = [];
    if (state.restaurantName) {
      labelParts.push(state.restaurantName);
    }
    if (board && board.name) {
      labelParts.push(board.name);
    }
    boardLabelElement.textContent = labelParts.join(" • ");
  }

  function subscribeToBoard(boardId) {
    if (unsubscribeMenu) {
      unsubscribeMenu();
    }
    if (typeof window.MenuData.subscribe === "function") {
      unsubscribeMenu = window.MenuData.subscribe(renderMenu, {
        boardId,
        restaurantId: displayRestaurantId
      });
    }
  }

  function subscribeToBoards(restaurantId) {
    if (unsubscribeBoards) {
      unsubscribeBoards();
    }
    if (typeof window.MenuData.subscribeBoards === "function") {
      unsubscribeBoards = window.MenuData.subscribeBoards(handleBoardUpdates, {
        restaurantId
      });
    }
  }

  function handleBoardUpdates(state) {
    boardsState = state;
    if (!state.boards.some((board) => board.id === displayBoardId)) {
      displayBoardId = state.activeBoardId;
      renderMenu(window.MenuData.getMenu(displayBoardId, displayRestaurantId));
      subscribeToBoard(displayBoardId);
      updateBoardLabel(state);
      return;
    }
    if (state.activeBoardId !== displayBoardId) {
      displayBoardId = state.activeBoardId;
      renderMenu(window.MenuData.getMenu(displayBoardId, displayRestaurantId));
      subscribeToBoard(displayBoardId);
    }
    updateBoardLabel(state);
  }

  function handleRestaurantState(state) {
    const exists = state.restaurants.some((restaurant) => restaurant.id === displayRestaurantId);
    if (!exists) {
      displayRestaurantId = state.activeRestaurantId;
      boardsState = window.MenuData.getBoards({ restaurantId: displayRestaurantId });
      displayBoardId = boardsState.activeBoardId;
      renderMenu(window.MenuData.getMenu(displayBoardId, displayRestaurantId));
      subscribeToBoard(displayBoardId);
      subscribeToBoards(displayRestaurantId);
      updateBoardLabel(boardsState);
    }
  }

  function cycleBoard() {
    if (!boardsState || boardsState.boards.length <= 1) {
      return;
    }
    const currentIndex = boardsState.boards.findIndex((board) => board.id === displayBoardId);
    const nextIndex = currentIndex === -1 || currentIndex === boardsState.boards.length - 1
      ? 0
      : currentIndex + 1;
    const nextBoard = boardsState.boards[nextIndex];
    displayBoardId = nextBoard.id;
    window.MenuData.setActiveBoard(displayBoardId, displayRestaurantId);
    boardsState = window.MenuData.getBoards({ restaurantId: displayRestaurantId });
    renderMenu(window.MenuData.getMenu(displayBoardId, displayRestaurantId));
    updateBoardLabel(boardsState);
    subscribeToBoard(displayBoardId);
  }

  function formatTimestamp() {
    const date = new Date();
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function sanitizeImageUrl(value) {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (/^data:image\//i.test(trimmed)) {
      return trimmed;
    }
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function createItemElement(item) {
    const element = document.createElement("article");
    element.className = "menu-item";

    const safeImageUrl = sanitizeImageUrl(item.image);
    if (safeImageUrl) {
      const photo = document.createElement("div");
      photo.className = "menu-item__photo";
      photo.style.backgroundImage = `url("${safeImageUrl}")`;
      element.appendChild(photo);
      element.classList.add("menu-item--with-image");
    }

    const content = document.createElement("div");
    content.className = "menu-item__content";
    const name = document.createElement("p");
    name.className = "menu-item__name";
    name.textContent = item.name;
    content.appendChild(name);
    if (item.description) {
      const description = document.createElement("p");
      description.className = "menu-item__description";
      description.textContent = item.description;
      content.appendChild(description);
    }
    element.appendChild(content);

    if (item.price) {
      const price = document.createElement("p");
      price.className = "menu-item__price";
      price.textContent = `$${item.price}`;
      element.appendChild(price);
    }

    return element;
  }

  function createSectionElement(section) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "menu-section";

    const header = document.createElement("header");
    const heading = document.createElement("h2");
    heading.textContent = section.name;
    header.appendChild(heading);

    if (section.description) {
      const description = document.createElement("p");
      description.className = "menu-section__description";
      description.textContent = section.description;
      header.appendChild(description);
    }

    sectionElement.appendChild(header);

    const itemsContainer = document.createElement("div");
    itemsContainer.className = "menu-items";
    section.items.forEach((item) => itemsContainer.appendChild(createItemElement(item)));
    sectionElement.appendChild(itemsContainer);
    return sectionElement;
  }

  function applyBackground(menu) {
    if (!menuBody) {
      return;
    }

    const backgrounds = Array.isArray(menu.backgrounds) ? menu.backgrounds : [];
    const activeBackground =
      backgrounds.find((background) => background.id === menu.activeBackgroundId) || backgrounds[0];

    const safeSource = sanitizeImageUrl(activeBackground?.source);
    if (activeBackground && safeSource) {
      menuBody.dataset.hasBackground = "true";
      menuBody.style.setProperty("--menu-background-image", `url("${safeSource}")`);
    } else {
      menuBody.dataset.hasBackground = "false";
      menuBody.style.removeProperty("--menu-background-image");
    }
  }

  function renderMenu(menu) {
    titleElement.textContent = menu.title;
    subtitleElement.textContent = menu.subtitle || "";
    updatedElement.textContent = `Updated ${formatTimestamp()}`;

    sectionsContainer.innerHTML = "";
    menu.sections.forEach((section) => {
      sectionsContainer.appendChild(createSectionElement(section));
    });
    applyBackground(menu);
  }

  if (boardToggleButton) {
    boardToggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      cycleBoard();
    });
  }

  renderMenu(window.MenuData.getMenu(displayBoardId, displayRestaurantId));
  subscribeToBoard(displayBoardId);
  updateBoardLabel(boardsState);
  subscribeToBoards(displayRestaurantId);
  if (typeof window.MenuData.subscribeRestaurants === "function") {
    window.MenuData.subscribeRestaurants(handleRestaurantState);
  }
  if (typeof window.MenuData.syncNow === "function") {
    window.MenuData.syncNow();
  }
});
