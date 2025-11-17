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

  function subscribeToBoard(boardId) {
    if (unsubscribeMenu) {
      unsubscribeMenu();
    }
    if (typeof window.MenuData.subscribe === "function") {
      unsubscribeMenu = window.MenuData.subscribe(renderMenu, { boardId });
    }
  }

  function handleBoardUpdates(state) {
    if (!state.boards.some((board) => board.id === displayBoardId)) {
      displayBoardId = state.activeBoardId;
      renderMenu(window.MenuData.getMenu(displayBoardId));
      subscribeToBoard(displayBoardId);
    }
    updateBoardLabel(state);
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

  function createItemElement(item) {
    const element = document.createElement("div");
    element.className = "menu-item";
    const priceMarkup = item.price ? `<p class="menu-item__price">$${item.price}</p>` : "";
    element.innerHTML = `
      <div>
        <p class="menu-item__name">${item.name}</p>
        ${item.description ? `<p class="menu-item__description">${item.description}</p>` : ""}
      </div>
      ${priceMarkup}
    `;
    return element;
  }

  function createSectionElement(section) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "menu-section";
    sectionElement.innerHTML = `
      <header>
        <h2>${section.name}</h2>
        ${section.description ? `<p class="menu-section__description">${section.description}</p>` : ""}
      </header>
    `;

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

    if (activeBackground) {
      menuBody.dataset.hasBackground = "true";
      menuBody.style.setProperty("--menu-background-image", `url("${activeBackground.source}")`);
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
