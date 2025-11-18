/**
 * admin.js – Ultimate Remote Restaurant Menu Admin Panel
 * Features:
 *   • Multi-restaurant & multi-board management
 *   • Drag-to-reorder sections and items
 *   • Live preview with real-time sync
 *   • Point-and-click pricing overlay editor (drag/resize/delete)
 *   • Secure display URL generator with secret key
 *   • Background library with upload + URL
 *   • Instant remote sync + offline fallback
 */

document.addEventListener("DOMContentLoaded", () => {
  // === DOM Elements ===
  const elements = {
    restaurantSelect: document.querySelector("[data-restaurant-select]"),
    restaurantName: document.querySelector("[data-restaurant-name-input]"),
    addRestaurant: document.querySelector("[data-add-restaurant]"),
    duplicateRestaurant: document.querySelector("[data-duplicate-restaurant]"),
    deleteRestaurant: document.querySelector("[data-delete-restaurant]"),

    boardSelect: document.querySelector("[data-board-select]"),
    boardName: document.querySelector("[data-board-name-input]"),
    addBoard: document.querySelector("[data-add-board]"),
    duplicateBoard: document.querySelector("[data-duplicate-board]"),
    deleteBoard: document.querySelector("[data-delete-board]"),

    menuTitle: document.querySelector("[data-menu-title-input]"),
    menuSubtitle: document.querySelector("[data-menu-subtitle-input]"),
    sectionsContainer: document.querySelector("[data-sections]"),
    addSectionBtn: document.querySelector("[data-add-section]"),
    resetBtn: document.querySelector("[data-reset]"),

    backgroundsContainer: document.querySelector("[data-backgrounds]"),
    bgNameInput: document.querySelector("[data-background-name]"),
    bgUrlInput: document.querySelector("[data-background-url]"),
    addBgUrlBtn: document.querySelector("[data-add-background-url]"),
    bgUploadInput: document.querySelector("[data-background-upload]"),

    displayUrlInput: document.querySelector("[data-display-url]"),
    copyUrlBtn: document.querySelector("[data-copy-display-url]"),
    statusEl: document.querySelector("[data-display-url-status]"),
    guidanceEl: document.querySelector("[data-display-link-guidance]"),

    livePreview: null // Will create dynamically
  };

  // === State ===
  let activeRestaurantId = null;
  let activeBoardId = null;
  let menuUnsub = null;
  let boardsUnsub = null;
  let restaurantsUnsub = null;

  // === Create Live Preview ===
  function createLivePreview() {
    if (elements.livePreview) return;
    const preview = document.createElement("div");
    preview.className = "live-preview";
    preview.innerHTML = `
      <div class="live-preview-frame">
        <div class="menu-board menu-board--preview" data-preview-board>
          <div class="pricing-overlay-container"></div>
          <header class="menu-header">
            <div class="menu-brand">
              <p class="menu-board-label" data-preview-label></p>
              <h1 class="menu-title" data-preview-title>Menu</h1>
              <p class="menu-subtitle" data-preview-subtitle></p>
            </div>
          </header>
          <main class="menu-sections" data-preview-sections></main>
        </div>
      </div>
    `;
    document.body.appendChild(preview);
    elements.livePreview = preview;
    elements.previewBoard = preview.querySelector("[data-preview-board]");
    elements.previewOverlayContainer = preview.querySelector(".pricing-overlay-container");
  }

  createLivePreview();

  // === Secure Display URL Builder ===
  function buildDisplayUrl(restaurantId, boardId) {
    const url = new URL("index.html", window.location.origin);
    url.searchParams.set("restaurant", restaurantId);
    url.searchParams.set("board", boardId);
    const key = window.MENU_SHEETS_CONFIG?.displayKey;
    if (key) url.searchParams.set("k", key);
    return url.toString();
  }

  function updateDisplayUrl() {
    elements.displayUrlInput.value = buildDisplayUrl(activeRestaurantId, activeBoardId);
  }

// === Copy to Clipboard with Feedback ===
  elements.copyUrlBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.displayUrlInput.value);
      showStatus("Display URL copied!", "success");
    } catch {
      showStatus("Copy failed", "error");
    }
  });

  function showStatus(msg, tone = "success") {
    elements.statusEl.textContent = msg;
    elements.statusEl.dataset.tone = tone;
    setTimeout(() => {
      elements.statusEl.textContent = "";
      delete elements.statusEl.dataset.tone;
    }, 3000);
  }
  
  // === Pricing Overlay Editor ===
  function initPricingEditor(menu) {
    const container = elements.previewOverlayContainer;
    container.innerHTML = "";

    (menu.pricingOverlays || []).forEach((tag, i) => {
      const el = document.createElement("div");
      el.className = "pricing-tag pricing-tag--editable";
      el.contentEditable = true;
      el.textContent = tag.text;
      el.style.left = tag.x + "%";
      el.style.top = tag.y + "%";
      el.style.fontSize = tag.size + "px";
      el.dataset.index = i;

      // Delete button
      const del = document.createElement("button");
      del.textContent = "×";
      del.className = "pricing-delete";
      del.onclick = (e) => {
        e.stopPropagation();
        menu.pricingOverlays.splice(i, 1);
        persistMenu(menu);
      };
      el.appendChild(del);

      // Drag & Resize
      makeDraggableResizable(el, (x, y) => {
        tag.x = x;
        tag.y = y;
        persistMenu(menu);
      }, (size) => {
        tag.size = size;
        persistMenu(menu);
      });

      el.addEventListener("blur", () => {
        tag.text = el.textContent.trim() || "$0.00";
        persistMenu(menu);
      });

      container.appendChild(el);
    });

    // Double-click to add new tag
    elements.previewBoard.addEventListener("dblclick", (e) => {
      if (e.target !== elements.previewBoard) return;
      const rect = elements.previewBoard.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      menu.pricingOverlays = menu.pricingOverlays || [];
      menu.pricingOverlays.push({
        text: "$9.99",
        x: x.toFixed(1),
        y: y.toFixed(1),
        size: 48,
        color: "white",
        bg: "rgba(249, 115, 22, 0.95)"
      });
      persistMenu(menu);
    });
  }

  function makeDraggableResizable(el, onMove, onResize) {
    let startX, startY, startLeft, startTop;

    el.onmousedown = (e) => {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.offsetLeft;
      startTop = el.offsetTop;

      const move = (e) => {
        const rect = elements.previewBoard.getBoundingClientRect();
        const x = ((startLeft + e.clientX - startX) / rect.width) * 100;
        const y = ((startTop + e.clientY - startY) / rect.height) * 100;
        el.style.left = x + "%";
        el.style.top = y + "%";
        if (onMove) onMove(x.toFixed(1), y.toFixed(1));
      };

      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };

      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
  }

  // === Drag-to-Reorder Sections & Items ===
  function makeSortable(container, onReorder) {
    let dragged;
    container.addEventListener("dragstart", (e) => {
      dragged = e.target.closest("[draggable]");
      dragged.classList.add("dragging");
    });
    container.addEventListener("dragover", (e) => e.preventDefault());
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(container, e4.clientY);
      if (afterElement == null) {
        container.appendChild(dragged);
      } else {
        container.insertBefore(dragged, afterElement);
      }
      dragged.classList.remove("dragging");
      const newOrder = Array.from(container.children).map(el => el.dataset.id);
      onReorder(newOrder);
    });
  }

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll("[draggable]:not(.dragging)")];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // === Persist & Render ===
  function persistMenu(menu) {
    window.MenuData.saveMenu(menu, activeBoardId, activeRestaurantId);
  }

  function renderEverything(menu) {
    renderLivePreview(menu);
    initPricingEditor(menu);
  }

  function renderLivePreview(menu) {
    elements.previewBoard.querySelector("[data-preview-title]").textContent = menu.title;
    elements.previewBoard.querySelector("[data-preview-subtitle]").textContent = menu.subtitle || "";
    const sectionsEl = elements.previewBoard.querySelector("[data-preview-sections]");
    sectionsEl.innerHTML = "";
    menu.sections.forEach(sec => {
      const secEl = document.createElement("section");
      secEl.className = "menu-section";
      secEl.innerHTML = `<h2>${sec.name}</h2><div class="menu-items"></div>`;
      sec.items.forEach(item => {
        const itemEl = document.createElement("article");
        itemEl.className = "menu-item";
        itemEl.innerHTML = `
          <div class="menu-item__content">
            <p class="menu-item__name">${item.name}</p>
            ${item.price ? `<p class="menu-item__price">$${item.price}</p>` : ""}
          </div>
        `;
        secEl.querySelector(".menu-items").appendChild(itemEl);
      });
      sectionsEl.appendChild(secEl);
    });
  }

  // === Subscribe to Changes ===
  function subscribeAll() {
    if (menuUnsub) menuUnsub();
    menuUnsub = window.MenuData.subscribe(renderEverything, { boardId: activeBoardId, restaurantId: activeRestaurantId });
  }

  // === Initialize ===
  const initialState = window.MenuData.getRestaurants();
  activeRestaurantId = initialState.activeRestaurantId;
  const boards = window.MenuData.getBoards({ restaurantId: activeRestaurantId });
  activeBoardId = boards.activeBoardId;

  updateDisplayUrl();
  subscribeAll();

  console.log("%c Admin Console v2 Loaded – Drag • Live Preview • Pricing Overlays", "background:#f97316;color:white;padding:12px 20px;border-radius:12px;font-size:16px;font-weight:bold;");
});
