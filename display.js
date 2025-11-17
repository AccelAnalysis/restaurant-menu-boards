document.addEventListener("DOMContentLoaded", () => {
  const titleElement = document.querySelector("[data-menu-title]");
  const subtitleElement = document.querySelector("[data-menu-subtitle]");
  const updatedElement = document.querySelector("[data-menu-updated]");
  const sectionsContainer = document.querySelector("[data-menu-sections]");
  const menuBody = document.querySelector(".menu-body");

  if (!titleElement || !sectionsContainer) {
    console.error("Display markup is missing required elements.");
    return;
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

  renderMenu(window.MenuData.getMenu());
  window.MenuData.subscribe(renderMenu);
});
