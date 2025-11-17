document.addEventListener("DOMContentLoaded", () => {
  const sectionsContainer = document.querySelector("[data-sections]");
  const addSectionButton = document.querySelector("[data-add-section]");
  const resetButton = document.querySelector("[data-reset]");
  const titleInput = document.querySelector("[data-menu-title-input]");
  const subtitleInput = document.querySelector("[data-menu-subtitle-input]");
  const restaurantSelect = document.querySelector("[data-restaurant-select]");
  const restaurantNameInput = document.querySelector("[data-restaurant-name-input]");
  const restaurantDisplayLinkInput = document.querySelector("[data-restaurant-display-link]");
  const copyDisplayLinkButton = document.querySelector("[data-copy-display-link]");
  const addRestaurantButton = document.querySelector("[data-add-restaurant]");
  const deleteRestaurantButton = document.querySelector("[data-delete-restaurant]");
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
    !restaurantSelect ||
    !restaurantNameInput ||
    !restaurantDisplayLinkInput ||
    !copyDisplayLinkButton ||
    !addRestaurantButton ||
    !deleteRestaurantButton ||
    !boardSelect ||
    !boardNameInput ||
    !addBoardButton ||
    !duplicateBoardButton ||
    !deleteBoardButton
  ) {
    console.error("Admin markup is missing required elements.");
    return;
  }

  let restaurantsState = window.MenuData.getRestaurants();
  let activeRestaurantId = restaurantsState.activeRestaurantId;
  let boardsState = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
  let activeBoardId = boardsState.activeBoardId;
  let menu = window.MenuData.getMenu(activeBoardId, { restaurantId: activeRestaurantId });
  let skipNextRender = false;
  let currentRestaurantId = activeRestaurantId;
  let unsubscribeMenu = null;
  let unsubscribeBoards = null;
  let unsubscribeRestaurants = null;

  function subscribeToMenu(boardId, restaurantId) {
    if (typeof unsubscribeMenu === "function") {
      unsubscribeMenu();
    }
    unsubscribeMenu = window.MenuData.subscribe((latestMenu) => {
      if (skipNextRender) {
        return;
      }
      menu = latestMenu;
      renderSections();
    }, { boardId, restaurantId });
  }

  function subscribeToBoards(restaurantId) {
    if (typeof unsubscribeBoards === "function") {
      unsubscribeBoards();
    }
    unsubscribeBoards = window.MenuData.subscribeBoards((state) => {
      const previousBoardId = activeBoardId;
      boardsState = state;
      activeBoardId = state.activeBoardId;
      renderBoardControls(state);
      if (activeBoardId !== previousBoardId) {
        menu = window.MenuData.getMenu(activeBoardId, { restaurantId: currentRestaurantId });
        renderSections();
        subscribeToMenu(activeBoardId, currentRestaurantId);
      }
    }, { restaurantId });
  }

  function loadRestaurantContext(restaurantId) {
    boardsState = window.MenuData.getBoards({ restaurantId });
    currentRestaurantId = boardsState.restaurantId;
    activeRestaurantId = boardsState.restaurantId;
    activeBoardId = boardsState.activeBoardId;
    menu = window.MenuData.getMenu(activeBoardId, { restaurantId: currentRestaurantId });
    renderBoardControls(boardsState);
    renderSections();
    subscribeToBoards(currentRestaurantId);
    subscribeToMenu(activeBoardId, currentRestaurantId);
  }

  function renderRestaurantControls(state = window.MenuData.getRestaurants()) {
    restaurantsState = state;
    activeRestaurantId = state.activeRestaurantId;
    restaurantSelect.innerHTML = "";
    state.restaurants.forEach((restaurant) => {
      const option = document.createElement("option");
      option.value = restaurant.id;
      option.textContent = restaurant.name;
      if (restaurant.id === state.activeRestaurantId) {
        option.selected = true;
      }
      restaurantSelect.appendChild(option);
    });

    const activeRestaurant = state.restaurants.find((restaurant) => restaurant.id === state.activeRestaurantId);
    restaurantNameInput.value = activeRestaurant ? activeRestaurant.name : "";
    deleteRestaurantButton.disabled = state.restaurants.length <= 1;
    restaurantSelect.disabled = state.restaurants.length === 0;
    restaurantNameInput.disabled = state.restaurants.length === 0;

    const displayLink = buildDisplayLink(activeRestaurant ? activeRestaurant.id : null);
    restaurantDisplayLinkInput.value = displayLink;
    restaurantDisplayLinkInput.disabled = !activeRestaurant;
    copyDisplayLinkButton.disabled = !activeRestaurant;
  }

  function renderBoardControls(state) {
    const snapshot = state || window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    boardsState = snapshot;
    activeBoardId = snapshot.activeBoardId;

    boardSelect.innerHTML = "";
    snapshot.boards.forEach((board) => {
      const option = document.createElement("option");
      option.value = board.id;
      option.textContent = board.name;
      if (board.id === snapshot.activeBoardId) {
        option.selected = true;
      }
      boardSelect.appendChild(option);
    });

    const activeBoard = snapshot.boards.find((board) => board.id === snapshot.activeBoardId);
    boardNameInput.value = activeBoard ? activeBoard.name : "";
    const hasBoards = snapshot.boards.length > 0;
    const disableBoardRemoval = snapshot.boards.length <= 1;
    deleteBoardButton.disabled = disableBoardRemoval;
    duplicateBoardButton.disabled = !hasBoards;
    boardNameInput.disabled = !hasBoards;
    boardSelect.disabled = !hasBoards;
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
    menu = window.MenuData.saveMenu(menu, activeBoardId, { restaurantId: activeRestaurantId });
    skipNextRender = false;
    if (shouldRerender) {
      renderSections();
    }
  }

  function buildDisplayLink(restaurantId) {
    const displayUrl = new URL("./index.html", window.location.href);
    displayUrl.search = "";
    if (restaurantId) {
      displayUrl.searchParams.set("restaurant", restaurantId);
    }
    return displayUrl.toString();
  }

  function copyDisplayLink() {
    const link = restaurantDisplayLinkInput.value;
    if (!link) {
      return;
    }
    const originalText = copyDisplayLinkButton.textContent;
    const acknowledge = () => {
      copyDisplayLinkButton.textContent = "Copied!";
      setTimeout(() => {
        copyDisplayLinkButton.textContent = originalText;
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(acknowledge).catch(() => {
        restaurantDisplayLinkInput.focus();
        restaurantDisplayLinkInput.select();
        document.execCommand("copy");
        acknowledge();
      });
    } else {
      restaurantDisplayLinkInput.focus();
      restaurantDisplayLinkInput.select();
      document.execCommand("copy");
      acknowledge();
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
    menu = window.MenuData.resetMenu(activeBoardId, { restaurantId: activeRestaurantId });
    renderSections();
  });

  restaurantSelect.addEventListener("change", (event) => {
    const restaurantId = event.target.value;
    activeRestaurantId = restaurantId;
    window.MenuData.setActiveRestaurant(restaurantId);
    loadRestaurantContext(restaurantId);
  });

  restaurantNameInput.addEventListener("change", (event) => {
    window.MenuData.renameRestaurant(activeRestaurantId, event.target.value);
  });

  addRestaurantButton.addEventListener("click", () => {
    const newRestaurant = window.MenuData.createRestaurant();
    activeRestaurantId = newRestaurant.id;
    renderRestaurantControls(window.MenuData.getRestaurants());
    loadRestaurantContext(activeRestaurantId);
  });

  deleteRestaurantButton.addEventListener("click", () => {
    if (!confirm("Delete this restaurant and all of its boards?")) {
      return;
    }
    window.MenuData.deleteRestaurant(activeRestaurantId);
    const updatedRestaurants = window.MenuData.getRestaurants();
    activeRestaurantId = updatedRestaurants.activeRestaurantId;
    renderRestaurantControls(updatedRestaurants);
    loadRestaurantContext(activeRestaurantId);
  });

  copyDisplayLinkButton.addEventListener("click", copyDisplayLink);

  titleInput.addEventListener("input", (event) => {
    menu.title = event.target.value;
    persistMenu();
  });

  subtitleInput.addEventListener("input", (event) => {
    menu.subtitle = event.target.value;
    persistMenu();
  });

  boardSelect.addEventListener("change", (event) => {
    const boardId = event.target.value;
    activeBoardId = boardId;
    window.MenuData.setActiveBoard(boardId, { restaurantId: activeRestaurantId });
    menu = window.MenuData.getMenu(boardId, { restaurantId: activeRestaurantId });
    renderSections();
    subscribeToMenu(boardId, activeRestaurantId);
  });

  boardNameInput.addEventListener("change", (event) => {
    window.MenuData.renameBoard(activeBoardId, event.target.value, { restaurantId: activeRestaurantId });
  });

  addBoardButton.addEventListener("click", () => {
    const newBoard = window.MenuData.createBoard({ restaurantId: activeRestaurantId });
    activeBoardId = newBoard.id;
    menu = window.MenuData.getMenu(activeBoardId, { restaurantId: activeRestaurantId });
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
  });

  duplicateBoardButton.addEventListener("click", () => {
    const duplicateBoard = window.MenuData.createBoard({
      sourceBoardId: activeBoardId,
      restaurantId: activeRestaurantId
    });
    activeBoardId = duplicateBoard.id;
    menu = window.MenuData.getMenu(activeBoardId, { restaurantId: activeRestaurantId });
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
  });

  deleteBoardButton.addEventListener("click", () => {
    if (!confirm("Delete this board?")) {
      return;
    }
    window.MenuData.deleteBoard(activeBoardId, { restaurantId: activeRestaurantId });
    const updatedState = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    activeBoardId = updatedState.activeBoardId;
    menu = window.MenuData.getMenu(activeBoardId, { restaurantId: activeRestaurantId });
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
  });

  renderRestaurantControls(restaurantsState);
  loadRestaurantContext(activeRestaurantId);

  unsubscribeRestaurants = window.MenuData.subscribeRestaurants((state) => {
    const previousRestaurantId = currentRestaurantId;
    renderRestaurantControls(state);
    if (state.activeRestaurantId !== previousRestaurantId) {
      loadRestaurantContext(state.activeRestaurantId);
    }
  });
});
