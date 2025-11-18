// admin.js – Completely Rewritten & Fixed v3.0 (November 2025)
document.addEventListener("DOMContentLoaded", () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let activeRestaurantId = null;
  let activeBoardId = null;
  let menu = null;
  let unsubMenu = null;
  let unsubBoards = null;
  let unsubRestaurants = null;

  // Build secure URL
  const buildUrl = () => {
    const url = new URL("index.html", location.origin);
    url.searchParams.set("restaurant", activeRestaurantId);
    url.searchParams.set("board", activeBoardId);
    if (window.MENU_SHEETS_CONFIG?.displayKey) {
      url.searchParams.set("k", window.MENU_SHEETS_CONFIG.displayKey);
    }
    $("[data-display-url]").value = url.toString();
  };

  // Status message
  const status = (msg, type = "success") => {
    const el = $("[data-display-url-status]");
    el.textContent = msg;
    el.className = "status " + type;
    setTimeout(() => el.textContent = "", 3000);
  };

  // Copy URL
  $("[data-copy-display-url]").onclick = async () => {
    await navigator.clipboard.writeText($("[data-display-url]").value);
    status("Copied to clipboard!");
  };

  // Render restaurants
  const renderRestaurants = () => {
    const state = window.MenuData.getRestaurants();
    activeRestaurantId = state.activeRestaurantId;
    const select = $("[data-restaurant-select]");
    select.innerHTML = state.restaurants.map(r => 
      `<option value="${r.id}" ${r.id === activeRestaurantId ? "selected" : ""}>${r.name}</option>`
    ).join("");
    const active = state.restaurants.find(r => r.id === activeRestaurantId);
    $("[data-restaurant-name-input]").value = active?.name || "";
    renderBoards();
  };

  // Render boards
  const renderBoards = () => {
    const state = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
    activeBoardId = state.activeBoardId;
    const select = $("[data-board-select]");
    select.innerHTML = state.boards.map(b => 
      `<option value="${b.id}" ${b.id === activeBoardId ? "selected" : ""}>${b.name}</option>`
    ).join("");
    const active = state.boards.find(b => b.id === activeBoardId);
    $("[data-board-name-input]").value = active?.name || "";
    $("[data-preview-label]").textContent = `${state.restaurantName} • ${active?.name || "Menu"}`;
    buildUrl();
    subscribeToMenu();
  };

  // Render live preview
  const renderPreview = (m) => {
    menu = m;
    $("[data-preview-title]").textContent = m.title;
    $("[data-preview-subtitle]").textContent = m.subtitle || "";
    const sections = $("[data-preview-sections]");
    sections.innerHTML = m.sections.map(sec => `
      <section class="menu-section">
        <h2>${sec.name}</h2>
        ${sec.description ? `<p class="menu-section__description">${sec.description}</p>` : ""}
        <div class="menu-items">
          ${sec.items.map(item => `
            <article class="menu-item ${item.image ? "menu-item--with-image" : ""}">
              ${item.image ? `<div class="menu-item__photo" style="background-image:url(${item.image})"></div>` : ""}
              <div class="menu-item__content">
                <p class="menu-item__name">${item.name}</p>
                ${item.description ? `<p class="menu-item__description">${item.description}</p>` : ""}
              </div>
              ${item.price ? `<p class="menu-item__price">$${item.price}</p>` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `).join("");

    // Pricing overlays
    const container = $(".pricing-overlay-container");
    container.innerHTML = "";
    (m.pricingOverlays || []).forEach((tag, i) => {
      const el = document.createElement("div");
      el.className = "pricing-tag";
      el.contentEditable = true;
      el.textContent = tag.text;
      el.style.left = tag.x + "%";
      el.style.top = tag.y + "%";
      el.style.fontSize = tag.size + "px";
      el.dataset.index = i;

      const del = document.createElement("button");
      del.textContent = "×";
      del.onclick = () => { m.pricingOverlays.splice(i, 1); save(); renderPreview(m); };
      el.appendChild(del);

      makeDraggable(el, (x, y) => { tag.x = x; tag.y = y; save(); });
      container.appendChild(el);
    });

    applyBackground(m);
  };

  const applyBackground = (m) => {
    const bg = m.backgrounds?.find(b => b.id === m.activeBackgroundId) || m.backgrounds?.[0];
    const body = document.body;
    if (bg) {
      body.style.setProperty("--menu-background-image", `url("${bg.source}")`);
      body.dataset.hasBackground = "true";
    } else {
      body.dataset.hasBackground = "false";
      body.style.removeProperty("--menu-background-image");
    }
  };

  // Save menu
  const save = () => {
    $("[data-menu-title-input]").value = menu.title = $("[data-menu-title-input]").value;
    $("[data-menu-subtitle-input]").value = menu.subtitle = $("[data-menu-subtitle-input]").value;
    window.MenuData.saveMenu(menu, activeBoardId, activeRestaurantId);
  };

  // Point-and-click pricing overlay
  $("[data-preview-board]").ondblclick = (e) => {
    if (e.target !== $("[data-preview-board]")) return;
    const rect = $("[data-preview-board]").getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    menu.pricingOverlays = menu.pricingOverlays || [];
    menu.pricingOverlays.push({ text: "$9.99", x: x.toFixed(1), y: y.toFixed(1), size: 56 });
    save();
    renderPreview(menu);
  };

  // Draggable pricing tags
  const makeDraggable = (el, onMove) => {
    let startX, startY;
    el.onmousedown = (e) => {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const rect = $("[data-preview-board]").getBoundingClientRect();
      const move = (e) => {
        const x = ((el.offsetLeft + e.clientX - startX) / rect.width) * 100;
        const y = ((el.offsetTop + e.clientY - startY) / rect.height) * 100;
        el.style.left = x + "%";
        el.style.top = y + "%";
        if (onMove) onMove(x.toFixed(1), y.toFixed(1));
      };
      document.onmousemove = move;
      document.onmouseup = () => { document.onmousemove = document.onmouseup = null; };
    };
  };

  // Subscriptions
  const subscribeToMenu = () => {
    if (unsubMenu) unsubMenu();
    unsubMenu = window.MenuData.subscribe(renderPreview, { boardId: activeBoardId, restaurantId: activeRestaurantId });
    renderPreview(window.MenuData.getMenu(activeBoardId, activeRestaurantId));
  };

  // Event Listeners
  $("[data-restaurant-select]").onchange = (e) => window.MenuData.setActiveRestaurant(e.target.value);
  $("[data-board-select]").onchange = (e) => window.MenuData.setActiveBoard(e.target.value, activeRestaurantId);
  $("[data-restaurant-name-input]").onchange = (e) => window.MenuData.renameRestaurant(activeRestaurantId, e.target.value);
  $("[data-board-name-input]").onchange = (e) => window.MenuData.renameBoard(activeBoardId, e.target.value, activeRestaurantId);
  $("[data-menu-title-input]").oninput = save;
  $("[data-menu-subtitle-input]").oninput = save;

  $("[data-add-restaurant]").onclick = () => {
    const name = prompt("Restaurant name:");
    if (name) {
      const r = window.MenuData.createRestaurant({ name });
      activeRestaurantId = r.id;
    }
  };

  $("[data-add-board]").onclick = () => {
    const name = prompt("Board name (e.g. Lunch Menu):", "New Menu Board");
    if (name) window.MenuData.createBoard({ restaurantId: activeRestaurantId, name });
  };

  $("[data-duplicate-restaurant]").onclick = () => window.MenuData.createRestaurant({ sourceRestaurantId: activeRestaurantId });
  $("[data-duplicate-board]").onclick = () => window.MenuData.createBoard({ restaurantId: activeRestaurantId, sourceBoardId: activeBoardId });
  $("[data-delete-restaurant]").onclick = () => confirm("Delete entire restaurant?") && window.MenuData.deleteRestaurant(activeRestaurantId);
  $("[data-delete-board]").onclick = () => confirm("Delete this board?") && window.MenuData.deleteBoard(activeBoardId, activeRestaurantId);

  $("[data-add-section]").onclick = () => {
    const name = prompt("Section name:", "New Section");
    if (name) {
      menu.sections.push({ name, description: "", items: [] });
      save();
      renderPreview(menu);
    }
  };

  // Initial load
  unsubRestaurants = window.MenuData.subscribeRestaurants(renderRestaurants);
  renderRestaurants();
  if (window.MenuData.syncNow) window.MenuData.syncNow();
});
