/**
 * display.js – Fire Stick / TV / Kiosk Display Logic
 * Features:
 *   • Auto-rotation with configurable timing
 *   • Secret key enforcement (blocks unauthorized access)
 *   • Pricing overlay rendering (draggable tags from admin)
 *   • Burn-in protection via subtle animation + auto-cycle
 *   • Instant sync with remote backend
 */

document.addEventListener("DOMContentLoaded", () => {
  // Select DOM elements
  const titleEl = document.querySelector("[data-menu-title]");
  const subtitleEl = document.querySelector("[data-menu-subtitle]");
  const updatedEl = document.querySelector("[data-menu-updated]");
  const boardLabelEl = document.querySelector("[data-board-label]");
  const sectionsContainer = document.querySelector("[data-menu-sections]");
  const menuBody = document.body;
  const menuBoard = document.querySelector("[data-menu-board]");
  const toggleButton = document.querySelector("[data-board-toggle]");

  // Create pricing overlay container if not exists
  let overlayContainer = document.querySelector(".pricing-overlay-container");
  if (!overlayContainer) {
    overlayContainer = document.createElement("div");
    overlayContainer.className = "pricing-overlay-container";
    menuBoard.appendChild(overlayContainer);
  }

  // Secret Key Enforcement
  const urlParams = new URLSearchParams(window.location.search);
  const displayKey = urlParams.get("k");
  const requiredKey = window.MENU_SHEETS_CONFIG?.displayKey || "";

  if (requiredKey && displayKey !== requiredKey) {
    document.body.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-family:system-ui;">
        <h1 style="font-size:4rem;margin-bottom:1rem;">Access Denied</h1>
        <p style="font-size:1.5rem;opacity:0.8;">Invalid or missing display key</p>
      </div>`;
    console.error("Display blocked: Invalid secret key");
    return;
  }

  // State
  let currentRestaurantId = null;
  let currentBoardId = null;
  let boardsState = { boards: [], activeBoardId: null };
  let unsubscribeMenu = null;
  let unsubscribeBoards = null;
  let autoRotateTimer = null;

  // Extract requested restaurant/board from URL
  const requestedRestaurant = urlParams.get("restaurant");
  const requestedBoard = urlParams.get("board");

  // Initialize from state
  const allRestaurants = window.MenuData.getRestaurants();
  currentRestaurantId = allRestaurants.restaurants.find(r => r.id === requestedRestaurant)
    ? requestedRestaurant
    : allRestaurants.activeRestaurantId;

  const initialBoards = window.MenuData.getBoards({ restaurantId: currentRestaurantId });
  currentBoardId = initialBoards.boards.find(b => b.id === requestedBoard)
    ? requestedBoard
    : initialBoards.activeBoardId;

  // Auto-Rotation Setup
  function startAutoRotation() {
    if (autoRotateTimer) clearInterval(autoRotateTimer);
    const config = window.MENU_SHEETS_CONFIG?.autoRotate || { enabled: true, intervalMs: 6 * 60 * 1000 };
    if (!config.enabled || boardsState.boards.length <= 1) return;

    autoRotateTimer = setInterval(() => {
      cycleToNextBoard();
    }, config.intervalMs);
  }

  function cycleToNextBoard() {
    if (boardsState.boards.length <= 1) return;
    const currentIndex = boardsState.boards.findIndex(b => b.id === currentBoardId);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= boardsState.boards.length) nextIndex = 0;
    const nextBoard = boardsState.boards[nextIndex];
    switchBoard(nextBoard.id);
  }

  function switchBoard(boardId) {
    currentBoardId = boardId;
    window.MenuData.setActiveBoard(boardId, currentRestaurantId);
    renderMenu(window.MenuData.getMenu(boardId, currentRestaurantId));
    subscribeToMenu(boardId);
    updateBoardLabel();
  }

  // Manual cycle (tap bottom-left corner)
  toggleButton?.addEventListener("click", (e) => {
    e.stopPropagation();
    cycleToNextBoard();
  });

  // Timestamp formatter
  function formatUpdatedTime() {
    const now = new Date();
    return now.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  // Render pricing overlays
  function renderPricingOverlays(overlays = []) {
    overlayContainer.innerHTML = "";
    overlays.forEach(tag => {
      const el = document.createElement("div");
      el.className = "pricing-tag";
      el.textContent = tag.text || "$0.00";
      el.style.left = tag.x + "%";
      el.style.top = tag.y + "%";
      el.style.fontSize = tag.size + "px";
      el.style.color = tag.color || "white";
      el.style.background = tag.bg || "rgba(249, 115, 22, 0.95)";
      overlayContainer.appendChild(el);
    });
  }

  // Apply background
  function applyBackground(menu) {
    const backgrounds = menu.backgrounds || [];
    const activeBg = backgrounds.find(b => b.id === menu.activeBackgroundId) || backgrounds[0];
    if (activeBg) {
      menuBody.style.setProperty("--menu-background-image", `url("${activeBg.source}")`);
      menuBody.dataset.hasBackground = "true";
    } else {
      menuBody.dataset.hasBackground = "false";
      menuBody.style.removeProperty("--menu-background-image");
    }
  }

  // Render full menu
  function renderMenu(menu) {
    if (!menu) return;

    titleEl.textContent = menu.title || "Menu";
    subtitleEl.textContent = menu.subtitle || "";
    updatedEl.textContent = `Updated ${formatUpdatedTime()}`;

    // Sections & items
    sectionsContainer.innerHTML = "";
    (menu.sections || []).forEach(section => {
      const secEl = document.createElement("section");
      secEl.className = "menu-section";
      secEl.innerHTML = `
        <h2>${section.name}</h2>
        ${section.description ? `<p class="menu-section__description">${section.description}</p>` : ""}
        <div class="menu-items"></div>
      `;
      const itemsContainer = secEl.querySelector(".menu-items");
      (section.items || []).forEach(item => {
        const itemEl = document.createElement("article");
        itemEl.className = "menu-item" + (item.image ? " menu-item--with-image" : "");

        if (item.image) {
          itemEl.innerHTML += `<div class="menu-item__photo" style="background-image:url('${item.image}')"></div>`;
        }

        itemEl.innerHTML += `
          <div class="menu-item__content">
            <p class="menu-item__name">${item.name}</p>
            ${item.description ? `<p class="menu-item__description">${item.description}</p>` : ""}
          </div>
          ${item.price ? `<p class="menu-item__price">$${item.price}</p>` : ""}
        `;
        itemsContainer.appendChild(itemEl);
      });
      sectionsContainer.appendChild(secEl);
    });

    // Background & overlays
    applyBackground(menu);
    renderPricingOverlays(menu.pricingOverlays || []);
  }

  // Update board label (e.g., "Downtown • Lunch Board")
  function updateBoardLabel() {
    if (!boardLabelEl) return;
    const board = boardsState.boards.find(b => b.id === currentBoardId);
    const restaurant = window.MenuData.getRestaurants().restaurants.find(r => r.id === currentRestaurantId);
    const parts = \`\${restaurant?.name || ""} \${board?.name ? "• " + board.name : ""}\`.trim();
    boardLabelEl.textContent = parts || "Menu Board";
  }

  // Subscription handlers
  function subscribeToMenu(boardId) {
    if (unsubscribeMenu) unsubscribeMenu();
    unsubscribeMenu = window.MenuData.subscribe(renderMenu, {
      boardId,
      restaurantId: currentRestaurantId
    });
  }

  function subscribeToBoards() {
    if (unsubscribeBoards) unsubscribeBoards();
    unsubscribeBoards = window.MenuData.subscribeBoards(state => {
      boardsState = state;
      if (!state.boards.find(b => b.id === currentBoardId)) {
        currentBoardId = state.activeBoardId;
        renderMenu(window.MenuData.getMenu(currentBoardId, currentRestaurantId));
        subscribeToMenu(currentBoardId);
      }
      updateBoardLabel();
      startAutoRotation();
    }, { restaurantId: currentRestaurantId });
  }

  // Initial render
  renderMenu(window.MenuData.getMenu(currentBoardId, currentRestaurantId));
  updateBoardLabel();
  subscribeToMenu(currentBoardId);
  subscribeToBoards();
  startAutoRotation();

  // Force sync on load & visibility
  if (window.MenuData.syncNow) {
    window.MenuData.syncNow();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) window.MenuData.syncNow();
    });
  }

  console.log("%c Display Engine Loaded – Secure • Auto-Rotating • Overlays Ready", "background:#f97316;color:white;padding:8px 16px;border-radius:8px;font-size:14px;");
});
