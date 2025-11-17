document.addEventListener("DOMContentLoaded", () => {
  const titleElement = document.querySelector("[data-menu-title]");
  const subtitleElement = document.querySelector("[data-menu-subtitle]");
  const updatedElement = document.querySelector("[data-menu-updated]");
  const sectionsContainer = document.querySelector("[data-menu-sections]");
  const boardLabelElement = document.querySelector("[data-board-label]");

  if (!titleElement || !sectionsContainer) {
    console.error("Display markup is missing required elements.");
    return;
  }

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

  function renderMenu(menu) {
    titleElement.textContent = menu.title;
    subtitleElement.textContent = menu.subtitle || "";
    updatedElement.textContent = `Updated ${formatTimestamp()}`;

    sectionsContainer.innerHTML = "";
    menu.sections.forEach((section) => {
      sectionsContainer.appendChild(createSectionElement(section));
    });
  }

  function subscribeToBoard(boardId) {
    if (typeof unsubscribeMenu === "function") {
      unsubscribeMenu();
    }
    unsubscribeMenu = window.MenuData.subscribe(renderMenu, { boardId });
  }

  function switchBoard(boardId) {
    displayBoardId = boardId;
    updateBoardLabel(window.MenuData.getBoards());
    renderMenu(window.MenuData.getMenu(boardId));
    subscribeToBoard(boardId);
  }

  switchBoard(displayBoardId);

  window.MenuData.subscribeBoards((state) => {
    const boardExists = state.boards.some((board) => board.id === displayBoardId);
    if (!boardExists) {
      switchBoard(state.activeBoardId);
      return;
    }
    updateBoardLabel(state);
  });
});
