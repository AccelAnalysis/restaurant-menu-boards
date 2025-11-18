document.addEventListener("DOMContentLoaded", () => {
  const sectionsContainer = document.querySelector("[data-sections]");
  const addSectionButton = document.querySelector("[data-add-section]");
  const resetButton = document.querySelector("[data-reset]");
  const titleInput = document.querySelector("[data-menu-title-input]");
  const subtitleInput = document.querySelector("[data-menu-subtitle-input]");
  const backgroundsContainer = document.querySelector("[data-backgrounds]");
  const backgroundNameInput = document.querySelector("[data-background-name]");
  const backgroundUrlInput = document.querySelector("[data-background-url]");
  const addBackgroundUrlButton = document.querySelector("[data-add-background-url]");
  const backgroundUploadInput = document.querySelector("[data-background-upload]");
  const restaurantSelect = document.querySelector("[data-restaurant-select]");
  const restaurantNameInput = document.querySelector("[data-restaurant-name-input]");
  const addRestaurantButton = document.querySelector("[data-add-restaurant]");
  const duplicateRestaurantButton = document.querySelector("[data-duplicate-restaurant]");
  const deleteRestaurantButton = document.querySelector("[data-delete-restaurant]");
  const boardSelect = document.querySelector("[data-board-select]");
  const boardNameInput = document.querySelector("[data-board-name-input]");
  const addBoardButton = document.querySelector("[data-add-board]");
  const duplicateBoardButton = document.querySelector("[data-duplicate-board]");
  const deleteBoardButton = document.querySelector("[data-delete-board]");
  const displayUrlInput = document.querySelector("[data-display-url]");
  const copyDisplayUrlButton = document.querySelector("[data-copy-display-url]");
  const displayUrlStatus = document.querySelector("[data-display-url-status]");

  const hasRestaurantControls = Boolean(
    restaurantSelect &&
    restaurantNameInput &&
    addRestaurantButton &&
    duplicateRestaurantButton &&
    deleteRestaurantButton
  );

  if (!hasRestaurantControls) {
    console.warn(
      "Restaurant manager controls are missing from the markup. Multi-restaurant editing is disabled in this session."
    );
  }

  if (
    !sectionsContainer ||
    !addSectionButton ||
    !titleInput ||
    !subtitleInput ||
    !backgroundsContainer ||
    !addBackgroundUrlButton ||
    !backgroundUrlInput ||
    !backgroundUploadInput ||
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
  let menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
  let skipNextRender = false;
  let unsubscribeMenu = null;
  let unsubscribeBoards = null;
  let displayUrlStatusTimeout = null;

  function renderRestaurantControls(state = window.MenuData.getRestaurants()) {
    restaurantsState = state;
    if (!state.restaurants.some((restaurant) => restaurant.id === activeRestaurantId)) {
      activeRestaurantId = state.activeRestaurantId;
    }

    if (!hasRestaurantControls) {
      return;
    }

    restaurantSelect.innerHTML = "";
    state.restaurants.forEach((restaurant) => {
      const option = document.createElement("option");
      option.value = restaurant.id;
      option.textContent = restaurant.name;
      if (restaurant.id === activeRestaurantId) {
        option.selected = true;
      }
      restaurantSelect.appendChild(option);
    });

    const activeRestaurant = state.restaurants.find((restaurant) => restaurant.id === activeRestaurantId);
    restaurantNameInput.value = activeRestaurant ? activeRestaurant.name : "";
    const disableRestaurantRemoval = state.restaurants.length <= 1;
    deleteRestaurantButton.disabled = disableRestaurantRemoval;
    duplicateRestaurantButton.disabled = !state.restaurants.length;
    restaurantNameInput.disabled = !state.restaurants.length;
    restaurantSelect.disabled = !state.restaurants.length;
    updateDisplayUrl();
  }

  function renderBoardControls(state = window.MenuData.getBoards({ restaurantId: activeRestaurantId })) {
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
    updateDisplayUrl();
  }

  function buildDisplayUrl(restaurantId, boardId) {
    if (!restaurantId || !boardId) {
      return "";
    }
    const url = new URL("./index.html", window.location.href);
    url.searchParams.set("restaurant", restaurantId);
    url.searchParams.set("board", boardId);
    return url.toString();
  }

  function clearDisplayUrlStatus() {
    if (!displayUrlStatus) {
      return;
    }
    displayUrlStatus.textContent = "";
    displayUrlStatus.removeAttribute("data-tone");
  }

  function setDisplayUrlStatus(message, tone = "success") {
    if (!displayUrlStatus) {
      return;
    }
    displayUrlStatus.textContent = message;
    displayUrlStatus.dataset.tone = tone;
    if (displayUrlStatusTimeout) {
      clearTimeout(displayUrlStatusTimeout);
    }
    displayUrlStatusTimeout = window.setTimeout(() => {
      clearDisplayUrlStatus();
      displayUrlStatusTimeout = null;
    }, 3000);
  }

  function updateDisplayUrl() {
    if (!displayUrlInput) {
      return;
    }
    const url = buildDisplayUrl(activeRestaurantId, activeBoardId);
    displayUrlInput.value = url;
    if (!url) {
      setDisplayUrlStatus("Display link unavailable.", "error");
    } else {
      clearDisplayUrlStatus();
    }
  }

  function subscribeToMenu(boardId, restaurantId) {
    if (unsubscribeMenu) {
      unsubscribeMenu();
    }
    if (typeof window.MenuData.subscribe === "function") {
      unsubscribeMenu = window.MenuData.subscribe((latestMenu) => {
        if (skipNextRender) {
          return;
        }
        menu = latestMenu;
        renderSections();
      }, { boardId, restaurantId });
    }
  }

  function subscribeToBoards(restaurantId) {
    if (unsubscribeBoards) {
      unsubscribeBoards();
    }
    if (typeof window.MenuData.subscribeBoards === "function") {
      unsubscribeBoards = window.MenuData.subscribeBoards(handleBoardUpdates, { restaurantId });
    }
  }

  function loadRestaurantContext(restaurantId) {
    activeRestaurantId = restaurantId;
    boardsState = window.MenuData.getBoards({ restaurantId });
    activeBoardId = boardsState.activeBoardId;
    menu = window.MenuData.getMenu(activeBoardId, restaurantId);
    renderBoardControls(boardsState);
    renderSections();
    subscribeToBoards(restaurantId);
    subscribeToMenu(activeBoardId, restaurantId);
    updateDisplayUrl();
  }

  function handleBoardUpdates(state) {
    const previousBoardId = activeBoardId;
    renderBoardControls(state);
    if (!state.boards.some((board) => board.id === previousBoardId)) {
      activeBoardId = state.activeBoardId;
      menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
      renderSections();
      subscribeToMenu(activeBoardId, activeRestaurantId);
      updateDisplayUrl();
      return;
    }
    if (state.activeBoardId !== previousBoardId) {
      activeBoardId = state.activeBoardId;
      menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
      renderSections();
      subscribeToMenu(activeBoardId, activeRestaurantId);
    }
    updateDisplayUrl();
  }

  function handleRestaurantUpdates(state) {
    const previousRestaurantId = activeRestaurantId;
    renderRestaurantControls(state);
    if (previousRestaurantId !== activeRestaurantId) {
      loadRestaurantContext(activeRestaurantId);
    }
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
    menu = window.MenuData.saveMenu(menu, activeBoardId, activeRestaurantId);
    skipNextRender = false;
    if (shouldRerender) {
      renderSections();
    }
  }

  function ensureBackgroundState() {
    if (!Array.isArray(menu.backgrounds)) {
      menu.backgrounds = [];
    }

    if (menu.backgrounds.length && !menu.activeBackgroundId) {
      menu.activeBackgroundId = menu.backgrounds[0].id;
    }
  }

  function createBackgroundId() {
    return `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addBackground({ source, name, origin }) {
    const trimmedSource = typeof source === "string" ? source.trim() : "";
    if (!trimmedSource) {
      alert("Please provide an image URL or upload a file.");
      return;
    }

    ensureBackgroundState();

    const label = name && name.trim() ? name.trim() : `Background ${menu.backgrounds.length + 1}`;
    const background = {
      id: createBackgroundId(),
      name: label,
      source: trimmedSource,
      origin: origin === "upload" ? "upload" : "url"
    };

    menu.backgrounds.push(background);
    menu.activeBackgroundId = background.id;

    persistMenu();
    renderBackgrounds();
  }

  function renderBackgrounds() {
    ensureBackgroundState();
    backgroundsContainer.innerHTML = "";

    if (!menu.backgrounds.length) {
      const empty = document.createElement("p");
      empty.className = "background-empty";
      empty.textContent = "Add a background using the fields above.";
      backgroundsContainer.appendChild(empty);
      return;
    }

    menu.backgrounds.forEach((background) => {
      const card = document.createElement("article");
      card.className = "background-card";
      card.dataset.backgroundId = background.id;
      if (menu.activeBackgroundId === background.id) {
        card.classList.add("is-active");
      }

      const preview = document.createElement("div");
      preview.className = "background-card__preview";
      preview.style.backgroundImage = `url("${background.source}")`;

      const body = document.createElement("div");
      body.className = "background-card__body";

      const details = document.createElement("div");
      const name = document.createElement("p");
      name.className = "background-card__name";
      name.textContent = background.name || "Background";
      const meta = document.createElement("p");
      meta.className = "background-card__meta";
      meta.textContent = background.origin === "upload" ? "Uploaded image" : "Linked image";
      details.appendChild(name);
      details.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "background-card__actions";
      if (menu.activeBackgroundId === background.id) {
        const badge = document.createElement("span");
        badge.className = "background-card__badge";
        badge.textContent = "Active";
        actions.appendChild(badge);
      } else {
        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.textContent = "Use background";
        selectButton.dataset.setBackground = "true";
        actions.appendChild(selectButton);
      }

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "ghost";
      removeButton.textContent = "Remove";
      removeButton.dataset.removeBackground = "true";
      actions.appendChild(removeButton);

      body.appendChild(details);
      body.appendChild(actions);
      card.appendChild(preview);
      card.appendChild(body);

      backgroundsContainer.appendChild(card);
    });
  }

  function createItemEditor(sectionIndex, item, itemIndex) {
    const element = document.createElement("div");
    element.className = "item-editor";
    element.dataset.sectionIndex = sectionIndex;
    element.dataset.itemIndex = itemIndex;
    element.innerHTML = `
      <div class="item-editor__grid">
        <div class="item-editor__fields">
          <input type="text" value="${escapeAttribute(item.name)}" data-item-name placeholder="Item name" />
          <input type="text" value="${escapeAttribute(item.description)}" data-item-description placeholder="Description" />
        </div>
        <div class="item-editor__media">
          <div class="item-image-preview" data-item-image-preview data-has-image="${item.image ? "true" : "false"}">
            <span data-item-image-hint>${item.image ? "" : "No image selected"}</span>
          </div>
          <input
            type="url"
            value="${escapeAttribute(item.image || "")}"
            data-item-image
            placeholder="Image URL"
          />
          <div class="item-image-actions">
            <label class="item-image-upload">
              <span>Upload image</span>
              <input type="file" accept="image/*" data-item-image-upload />
            </label>
            <button type="button" class="ghost" data-clear-item-image ${item.image ? "" : "disabled"}>
              Remove image
            </button>
          </div>
        </div>
      </div>
      <div class="item-actions">
        <input type="text" value="${escapeAttribute(item.price)}" data-item-price placeholder="Price" />
        <button type="button" data-remove-item>Remove</button>
      </div>
    `;
    updateItemImagePreview(element, item.image);
    return element;
  }

  function updateItemImagePreview(editorElement, image) {
    if (!editorElement) {
      return;
    }
    const preview = editorElement.querySelector("[data-item-image-preview]");
    const hint = editorElement.querySelector("[data-item-image-hint]");
    const removeButton = editorElement.querySelector("[data-clear-item-image]");
    if (preview) {
      if (image) {
        preview.dataset.hasImage = "true";
        preview.style.backgroundImage = `url("${image}")`;
      } else {
        preview.dataset.hasImage = "false";
        preview.style.backgroundImage = "";
      }
    }
    if (hint) {
      hint.textContent = image ? "" : "No image selected";
    }
    if (removeButton) {
      removeButton.disabled = !image;
    }
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
    renderBackgrounds();
  }

  function ensureSection(sectionIndex) {
    if (!menu.sections[sectionIndex]) {
      menu.sections[sectionIndex] = { name: "Untitled Section", description: "", items: [] };
    }
  }

  function ensureItem(sectionIndex, itemIndex) {
    ensureSection(sectionIndex);
    if (!menu.sections[sectionIndex].items[itemIndex]) {
      menu.sections[sectionIndex].items[itemIndex] = {
        name: "New Item",
        description: "",
        price: "",
        image: ""
      };
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
    } else if (event.target.matches("[data-item-image]")) {
      const itemElement = event.target.closest("[data-item-index]");
      const itemIndex = Number(itemElement.dataset.itemIndex);
      ensureItem(sectionIndex, itemIndex);
      const value = event.target.value.trim();
      menu.sections[sectionIndex].items[itemIndex].image = value;
      event.target.value = value;
      updateItemImagePreview(itemElement, value);
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
      menu.sections[sectionIndex].items.push({
        name: "New Item",
        description: "",
        price: "",
        image: ""
      });
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

    if (event.target.matches("[data-clear-item-image]")) {
      const itemElement = event.target.closest("[data-item-index]");
      if (!itemElement) {
        return;
      }
      const itemIndex = Number(itemElement.dataset.itemIndex);
      ensureItem(sectionIndex, itemIndex);
      menu.sections[sectionIndex].items[itemIndex].image = "";
      const urlInput = itemElement.querySelector("[data-item-image]");
      if (urlInput) {
        urlInput.value = "";
      }
      updateItemImagePreview(itemElement, "");
      persistMenu();
    }
  });

  sectionsContainer.addEventListener("change", (event) => {
    if (!event.target.matches("[data-item-image-upload]")) {
      return;
    }
    const sectionElement = event.target.closest("[data-section-index]");
    const itemElement = event.target.closest("[data-item-index]");
    if (!sectionElement || !itemElement) {
      return;
    }
    const sectionIndex = Number(sectionElement.dataset.sectionIndex);
    const itemIndex = Number(itemElement.dataset.itemIndex);
    const files = event.target.files;
    if (!files || !files.length) {
      return;
    }
    const file = files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        alert("Unable to read that file. Please try another image.");
        return;
      }
      ensureItem(sectionIndex, itemIndex);
      menu.sections[sectionIndex].items[itemIndex].image = reader.result;
      const urlInput = itemElement.querySelector("[data-item-image]");
      if (urlInput) {
        urlInput.value = reader.result;
      }
      updateItemImagePreview(itemElement, reader.result);
      persistMenu();
    };
    reader.onerror = (error) => {
      console.error("Unable to read uploaded file", error);
      alert("Unable to read that file. Please try another image.");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });

  addSectionButton.addEventListener("click", () => {
    menu.sections.push({ name: "New Section", description: "", items: [] });
    persistMenu(true);
  });

  resetButton.addEventListener("click", () => {
    if (!confirm("Reset menu to defaults?")) {
      return;
    }
    menu = window.MenuData.resetMenu(activeBoardId, activeRestaurantId);
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

  titleInput.addEventListener("input", (event) => {
    menu.title = event.target.value;
    persistMenu();
  });

  subtitleInput.addEventListener("input", (event) => {
    menu.subtitle = event.target.value;
    persistMenu();
  });

  addBackgroundUrlButton.addEventListener("click", () => {
    const source = backgroundUrlInput.value.trim();
    if (!source) {
      backgroundUrlInput.focus();
      return;
    }
    const name = backgroundNameInput ? backgroundNameInput.value : "";
    addBackground({ source, name, origin: "url" });
    backgroundUrlInput.value = "";
    if (backgroundNameInput) {
      backgroundNameInput.value = "";
    }
  });

  backgroundUploadInput.addEventListener("change", (event) => {
    const files = event.target.files;
    if (!files || !files.length) {
      return;
    }
    const file = files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        alert("Unable to read that file. Please try another image.");
        return;
      }
      addBackground({ source: reader.result, name: file.name, origin: "upload" });
    };
    reader.onerror = (error) => {
      console.error("Unable to read uploaded file", error);
      alert("Unable to read that file. Please try another image.");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });

  backgroundsContainer.addEventListener("click", (event) => {
    const card = event.target.closest("[data-background-id]");
    if (!card) {
      return;
    }
    const backgroundId = card.dataset.backgroundId;

    if (event.target.matches("[data-set-background]")) {
      menu.activeBackgroundId = backgroundId;
      persistMenu();
      renderBackgrounds();
    }

    if (event.target.matches("[data-remove-background]")) {
      menu.backgrounds = menu.backgrounds.filter((background) => background.id !== backgroundId);
      if (menu.activeBackgroundId === backgroundId) {
        menu.activeBackgroundId = menu.backgrounds[0]?.id || "";
      }
      persistMenu();
      renderBackgrounds();
    }
  });

  if (hasRestaurantControls) {
    restaurantSelect.addEventListener("change", (event) => {
      const restaurantId = event.target.value;
      window.MenuData.setActiveRestaurant(restaurantId);
      loadRestaurantContext(restaurantId);
    });

    restaurantNameInput.addEventListener("change", (event) => {
      window.MenuData.renameRestaurant(activeRestaurantId, event.target.value);
    });

    addRestaurantButton.addEventListener("click", () => {
      const proposedName = prompt("New restaurant name (optional)");
      const options = {};
      if (proposedName && proposedName.trim()) {
        options.name = proposedName.trim();
      }
      const newRestaurant = window.MenuData.createRestaurant(options);
      restaurantsState = window.MenuData.getRestaurants();
      renderRestaurantControls(restaurantsState);
      loadRestaurantContext(newRestaurant.id);
    });

    duplicateRestaurantButton.addEventListener("click", () => {
      const duplicate = window.MenuData.createRestaurant({ sourceRestaurantId: activeRestaurantId });
      restaurantsState = window.MenuData.getRestaurants();
      renderRestaurantControls(restaurantsState);
      loadRestaurantContext(duplicate.id);
    });

    deleteRestaurantButton.addEventListener("click", () => {
      if (!confirm("Delete this restaurant and all of its boards?")) {
        return;
      }
      window.MenuData.deleteRestaurant(activeRestaurantId);
      restaurantsState = window.MenuData.getRestaurants();
      renderRestaurantControls(restaurantsState);
      loadRestaurantContext(restaurantsState.activeRestaurantId);
    });
  }

  boardSelect.addEventListener("change", (event) => {
    const boardId = event.target.value;
    activeBoardId = boardId;
    window.MenuData.setActiveBoard(boardId, activeRestaurantId);
    menu = window.MenuData.getMenu(boardId, activeRestaurantId);
    renderSections();
    subscribeToMenu(boardId, activeRestaurantId);
    updateDisplayUrl();
  });

  boardNameInput.addEventListener("change", (event) => {
    window.MenuData.renameBoard(activeBoardId, event.target.value, activeRestaurantId);
  });

  addBoardButton.addEventListener("click", () => {
    const newBoard = window.MenuData.createBoard({ restaurantId: activeRestaurantId });
    activeBoardId = newBoard.id;
    boardsState = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    renderBoardControls(boardsState);
    menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
    updateDisplayUrl();
  });

  duplicateBoardButton.addEventListener("click", () => {
    const duplicateBoard = window.MenuData.createBoard({
      restaurantId: activeRestaurantId,
      sourceBoardId: activeBoardId
    });
    activeBoardId = duplicateBoard.id;
    boardsState = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    renderBoardControls(boardsState);
    menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
    updateDisplayUrl();
  });

  deleteBoardButton.addEventListener("click", () => {
    if (!confirm("Delete this board?")) {
      return;
    }
    window.MenuData.deleteBoard(activeBoardId, activeRestaurantId);
    const updatedState = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    boardsState = updatedState;
    activeBoardId = updatedState.activeBoardId;
    renderBoardControls(updatedState);
    menu = window.MenuData.getMenu(activeBoardId, activeRestaurantId);
    renderSections();
    subscribeToMenu(activeBoardId, activeRestaurantId);
    updateDisplayUrl();
  });

  if (displayUrlInput) {
    displayUrlInput.addEventListener("focus", () => {
      displayUrlInput.select();
    });
  }

  if (copyDisplayUrlButton && displayUrlInput) {
    copyDisplayUrlButton.addEventListener("click", () => {
      if (!displayUrlInput.value) {
        setDisplayUrlStatus("Display link unavailable.", "error");
        return;
      }
      const text = displayUrlInput.value;
      const copyAction = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(text)
        : new Promise((resolve, reject) => {
            displayUrlInput.select();
            const success = document.execCommand("copy");
            displayUrlInput.setSelectionRange(displayUrlInput.value.length, displayUrlInput.value.length);
            success ? resolve() : reject(new Error("Copy command failed"));
          });
      copyAction
        .then(() => {
          setDisplayUrlStatus("Link copied to clipboard.", "success");
        })
        .catch(() => {
          setDisplayUrlStatus("Unable to copy link.", "error");
        });
    });
  }

  renderRestaurantControls(restaurantsState);
  loadRestaurantContext(activeRestaurantId);
  if (typeof window.MenuData.subscribeRestaurants === "function") {
    window.MenuData.subscribeRestaurants(handleRestaurantUpdates);
  }
  if (typeof window.MenuData.syncNow === "function") {
    window.MenuData.syncNow();
  }
});
