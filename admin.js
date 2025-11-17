document.addEventListener("DOMContentLoaded", () => {
  const sectionsContainer = document.querySelector("[data-sections]");
  const addSectionButton = document.querySelector("[data-add-section]");
  const resetButton = document.querySelector("[data-reset]");
  const titleInput = document.querySelector("[data-menu-title-input]");
  const subtitleInput = document.querySelector("[data-menu-subtitle-input]");
  const boardSelect = document.querySelector("[data-board-select]");
  const boardNameInput = document.querySelector("[data-board-name-input]");
  const addBoardButton = document.querySelector("[data-add-board]");
  const duplicateBoardButton = document.querySelector("[data-duplicate-board]");
  const deleteBoardButton = document.querySelector("[data-delete-board]");

  if (
    !sectionsContainer ||
    !addSectionButton ||
    !titleInput ||
    !subtitleInput ||
    !boardSelect ||
    !boardNameInput ||
    !addBoardButton ||
    !duplicateBoardButton ||
    !deleteBoardButton
  ) {
    console.error("Admin markup is missing required elements.");
    return;
  }

  let boardsState = window.MenuData.getBoards();
  let activeBoardId = boardsState.activeBoardId;
  let menu = window.MenuData.getMenu(activeBoardId);
  let skipNextRender = false;

  function renderBoardControls(state = window.MenuData.getBoards()) {
    boardsState = state;
    activeBoardId = state.activeBoardId;

    boardSelect.innerHTML = "";
    state.boards.forEach((board) => {
      const option = document.createElement("option");
      option.value = board.id;
      option.textContent = board.name;
      if (board.id === state.activeBoardId) {
        option.selected = true;
      }
      boardSelect.appendChild(option);
    });

    const activeBoard = state.boards.find((board) => board.id === state.activeBoardId);
    boardNameInput.value = activeBoard ? activeBoard.name : "";
    const disableBoardRemoval = state.boards.length <= 1;
    deleteBoardButton.disabled = disableBoardRemoval;
    duplicateBoardButton.disabled = !state.boards.length;
    boardNameInput.disabled = !state.boards.length;
    boardSelect.disabled = !state.boards.length;
  }

  function escapeAttribute(value = "") {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function persistMenu(shouldRerender = false) {
    skipNextRender = true;
    menu = window.MenuData.saveMenu(menu, activeBoardId);
    skipNextRender = false;
    if (shouldRerender) {
      renderSections();
    }
  }

  function createItemEditor(sectionIndex, item, itemIndex) {
    const element = document.createElement("div");
    element.className = "item-editor";
    element.dataset.sectionIndex = sectionIndex;
    element.dataset.itemIndex = itemIndex;
    element.innerHTML = `
      <div>
        <input type="text" value="${escapeAttribute(item.name)}" data-item-name placeholder="Item name" />
        <input type="text" value="${escapeAttribute(item.description)}" data-item-description placeholder="Description" />
      </div>
      <div class="item-actions">
        <input type="text" value="${escapeAttribute(item.price)}" data-item-price placeholder="Price" />
        <button type="button" data-remove-item>Remove</button>
      </div>
    `;
    return element;
  }

  function createSectionEditor(section, index) {
    const wrapper = document.createElement("section");
    wrapper.className = "section-editor";
    wrapper.dataset.sectionIndex = index;
    wrapper.innerHTML = `
      <header>
        <input type="text" value="${escapeAttribute(section.name)}" data-section-name placeholder="Section name" />
        <textarea data-section-description placeholder="Description">${escapeAttribute(section.description)}</textarea>
        <button type="button" data-remove-section>Remove section</button>
      </header>
      <div class="item-editor-list"></div>
      <button type="button" class="ghost" data-add-item>Add item</button>
    `;

    const itemList = wrapper.querySelector(".item-editor-list");
    section.items.forEach((item, itemIndex) => {
      itemList.appendChild(createItemEditor(index, item, itemIndex));
    });

    return wrapper;
  }

  function renderSections() {
    titleInput.value = menu.title || "";
    subtitleInput.value = menu.subtitle || "";
    sectionsContainer.innerHTML = "";
    menu.sections.forEach((section, index) => {
      sectionsContainer.appendChild(createSectionEditor(section, index));
    });
  }

  function ensureSection(sectionIndex) {
    if (!menu.sections[sectionIndex]) {
      menu.sections[sectionIndex] = { name: "Untitled Section", description: "", items: [] };
    }
  }

  function ensureItem(sectionIndex, itemIndex) {
    ensureSection(sectionIndex);
    if (!menu.sections[sectionIndex].items[itemIndex]) {
      menu.sections[sectionIndex].items[itemIndex] = { name: "New Item", description: "", price: "" };
    }
  }

  sectionsContainer.addEventListener("input", (event) => {
    const sectionElement = event.target.closest("[data-section-index]");
    if (!sectionElement) return;

    const sectionIndex = Number(sectionElement.dataset.sectionIndex);
    ensureSection(sectionIndex);

    if (event.target.matches("[data-section-name]")) {
      menu.sections[sectionIndex].name = event.target.value;
    } else if (event.target.matches("[data-section-description]")) {
      menu.sections[sectionIndex].description = event.target.value;
    } else if (event.target.matches("[data-item-name]")) {
      const itemIndex = Number(event.target.closest("[data-item-index]").dataset.itemIndex);
      ensureItem(sectionIndex, itemIndex);
      menu.sections[sectionIndex].items[itemIndex].name = event.target.value;
    } else if (event.target.matches("[data-item-description]")) {
      const itemIndex = Number(event.target.closest("[data-item-index]").dataset.itemIndex);
      ensureItem(sectionIndex, itemIndex);
      menu.sections[sectionIndex].items[itemIndex].description = event.target.value;
    } else if (event.target.matches("[data-item-price]")) {
      const itemIndex = Number(event.target.closest("[data-item-index]").dataset.itemIndex);
      ensureItem(sectionIndex, itemIndex);
      menu.sections[sectionIndex].items[itemIndex].price = event.target.value;
    } else {
      return;
    }

    persistMenu();
  });

  sectionsContainer.addEventListener("click", (event) => {
    const sectionElement = event.target.closest("[data-section-index]");
    if (!sectionElement) return;
    const sectionIndex = Number(sectionElement.dataset.sectionIndex);

    if (event.target.matches("[data-add-item]")) {
      menu.sections[sectionIndex].items.push({ name: "New Item", description: "", price: "" });
      persistMenu(true);
    }

    if (event.target.matches("[data-remove-section]")) {
      menu.sections.splice(sectionIndex, 1);
      persistMenu(true);
    }

    if (event.target.matches("[data-remove-item]")) {
      const itemIndex = Number(event.target.closest("[data-item-index]").dataset.itemIndex);
      menu.sections[sectionIndex].items.splice(itemIndex, 1);
      persistMenu(true);
    }
  });

  addSectionButton.addEventListener("click", () => {
    menu.sections.push({ name: "New Section", description: "", items: [] });
    persistMenu(true);
  });

  resetButton.addEventListener("click", () => {
    if (!confirm("Reset menu to defaults?")) {
      return;
    }
    menu = window.MenuData.resetMenu(activeBoardId);
    renderSections();
  });

  titleInput.addEventListener("input", (event) => {
    menu.title = event.target.value;
    persistMenu();
  });

  subtitleInput.addEventListener("input", (event) => {
    menu.subtitle = event.target.value;
    persistMenu();
  });

  window.MenuData.subscribe((latestMenu) => {
    if (skipNextRender) {
      return;
    }
    menu = latestMenu;
    renderSections();
  });

  window.MenuData.subscribeBoards(renderBoardControls);

  boardSelect.addEventListener("change", (event) => {
    const boardId = event.target.value;
    activeBoardId = boardId;
    window.MenuData.setActiveBoard(boardId);
    menu = window.MenuData.getMenu(boardId);
    renderSections();
  });

  boardNameInput.addEventListener("change", (event) => {
    window.MenuData.renameBoard(activeBoardId, event.target.value);
  });

  addBoardButton.addEventListener("click", () => {
    const newBoard = window.MenuData.createBoard();
    activeBoardId = newBoard.id;
    menu = window.MenuData.getMenu(activeBoardId);
    renderSections();
  });

  duplicateBoardButton.addEventListener("click", () => {
    const duplicateBoard = window.MenuData.createBoard({ sourceBoardId: activeBoardId });
    activeBoardId = duplicateBoard.id;
    menu = window.MenuData.getMenu(activeBoardId);
    renderSections();
  });

  deleteBoardButton.addEventListener("click", () => {
    if (!confirm("Delete this board?")) {
      return;
    }
    window.MenuData.deleteBoard(activeBoardId);
    const updatedState = window.MenuData.getBoards();
    activeBoardId = updatedState.activeBoardId;
    menu = window.MenuData.getMenu(activeBoardId);
    renderSections();
  });

  renderBoardControls(boardsState);
  renderSections();
});
