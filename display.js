document.addEventListener("DOMContentLoaded", () => {
  const titleElement = document.querySelector("[data-menu-title]");
  const subtitleElement = document.querySelector("[data-menu-subtitle]");
  const updatedElement = document.querySelector("[data-menu-updated]");
  const sectionsContainer = document.querySelector("[data-menu-sections]");
  const boardLabelElement = document.querySelector("[data-board-label]");
  const boardToggleButton = document.querySelector("[data-board-toggle]");
  const menuBody = document.querySelector(".menu-body");
  const boardLabelElement = document.querySelector("[data-board-label]");

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
  const boardState = window.MenuData.getBoards();
  const params = new URLSearchParams(window.location.search);
  const requestedBoardId = params.get("board");
  let displayBoardId = boardState.boards.some((board) => board.id === requestedBoardId)
    ? requestedBoardId
    : boardState.activeBoardId;
  let unsubscribeMenu = null;

  function updateBoardLabel(state = window.MenuData.getBoards()) {
    if (!boardLabelElement) {
      return;
    }
    const board = state.boards.find((entry) => entry.id === displayBoardId);
    boardLabelElement.textContent = board ? board.name : "";
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

  function subscribeToBoard(boardId) {
    if (typeof unsubscribeMenu === "function") {
      unsubscribeMenu();
    }
    unsubscribeMenu = window.MenuData.subscribe(renderMenu, {
      boardId,
      restaurantId: displayRestaurantId
    });
  }

  function subscribeToBoards(restaurantId) {
    if (typeof unsubscribeBoards === "function") {
      unsubscribeBoards();
    }
    unsubscribeBoards = window.MenuData.subscribeBoards((state) => {
      boardsState = state;
      const boardExists = state.boards.some((board) => board.id === displayBoardId);
      if (!boardExists) {
        switchBoard(state.activeBoardId);
        return;
      }
      updateBoardLabel(state);
    }, { restaurantId });
  }

  function switchBoard(boardId) {
    const targetBoard = boardsState.boards.find((board) => board.id === boardId);
    if (!targetBoard) {
      boardId = boardsState.activeBoardId;
    }
    displayBoardId = boardId;
    updateBoardLabel(boardsState);
    renderMenu(window.MenuData.getMenu(boardId, { restaurantId: displayRestaurantId }));
    subscribeToBoard(boardId);
  }

  function cycleBoard() {
    if (!boardsState.boards.length || boardsState.boards.length === 1) {
      return;
    }
    const currentIndex = boardsState.boards.findIndex((board) => board.id === displayBoardId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % boardsState.boards.length : 0;
    switchBoard(boardsState.boards[nextIndex].id);
  }

  switchBoard(displayBoardId);
  subscribeToBoards(displayRestaurantId);

  if (boardToggleButton) {
    boardToggleButton.addEventListener("click", cycleBoard);
  renderMenu(window.MenuData.getMenu(displayBoardId));
  subscribeToBoard(displayBoardId);
  updateBoardLabel(boardState);
  window.MenuData.subscribeBoards(handleBoardUpdates);
  if (typeof window.MenuData.syncNow === "function") {
    window.MenuData.syncNow();
  }
});
