/**
 * config.js
 * Central configuration for the Remote Restaurant Menu Board System
 * Secure defaults + auto-rotation + Fire Stick optimized
 */

window.DEFAULT_MENU = {
  title: "Sunny Side Café",
  subtitle: "Locally roasted coffee • Freshly baked pastries • Made with love",
  sections: [
    {
      name: "Breakfast Classics",
      description: "Served all day",
      items: [
        { name: "Buttermilk Pancakes", description: "Whipped butter, real maple syrup, seasonal berries", price: "12.95", image: "" },
        { name: "Avocado Toast", description: "Sourdough, smashed avocado, poтина eggs, chili oil", price: "11.95", image: "" },
        { name: "Morning Burrito", description: "Scrambled eggs, chorizo, black beans, queso fresco", price: "13.95", image: "" }
      ]
    },
    {
      name: "Lunch Favorites",
      description: "Available after 11 a.m.",
      items: [
        { name: "Citrus Grilled Chicken Sandwich", description: "Pickled onion, arugula, herb aioli, brioche bun", price: "15.95", image: "" },
        { name: "Quinoa Power Bowl", description: "Charred broccoli, sweet potato, tahini dressing, ancient grains", price: "14.95", image: "" },
        { name: "Seared Salmon Salad", description: "Mixed greens, grapefruit, fennel, champagne vinaigrette", price: "18.95", image: "" }
      ]
    },
    {
      name: "Beverages",
      description: "House-made & locally sourced",
      items: [
        { name: "Cold Brew", price: "5.50", image: "" },
        { name: "Seasonal Latte", description: "Ask about today’s rotating flavor", price: "6.50", image: "" },
        { name: "Fresh Lemonade", price: "4.95", image: "" }
      ]
    }
  ],
  backgrounds: [
    {
      id: "bg-default",
      name: "Default Sunrise",
      source: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=80",
      origin: "url"
    }
  ],
  activeBackgroundId: "bg-default"
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE SYNC & SECURITY SETTINGS (Google Apps Script backend)
// ─────────────────────────────────────────────────────────────────────────────

window.MENU_SHEETS_CONFIG = {
  // ─── REQUIRED: Google Apps Script Web App URL (deployed from Code.gs) ───
  endpoint: "https://script.google.com/macros/s/AKfycbz4rBaKb9IUhopuMGLHEZxbxj2HqqB2LE3R8XIIRFfWqNOiQUksg_gOz79CZQbtEPtg/exec", // ← PASTE YOUR DEPLOYED WEB APP URL HERE (e.g. https://script.google.com/macros/s/ABC123/exec)

  // ─── ADMIN TOKEN (protects writes from unauthorized admins) ───
  token: "90210-rAxfyg-5zokpu-ceqpyb",   // ← CHANGE THIS!

  // ─── DISPLAY SECRET KEY (protects public Fire Stick URLs from guessing) ───
  // Any display URL without this exact key will show "Invalid display key"
  displayKey: "rAxfyg-5zokpu-ceqpyb-23314", // ← CHANGE THIS!

  // ─── SYNC BEHAVIOR (optimized for 24/7 Fire Stick displays) ───
  pollInterval: 10000,    // Check for updates every 10 seconds
  timeoutMs: 15000,       // Abort stalled requests after 15s

  // ─── AUTO-ROTATION SETTINGS (prevents screen burn-in) ───
  autoRotate: {
    enabled: true,
    intervalMs: 2 * 60 * 1000,        // 2 minutes per board (adjustable per restaurant in future)
    randomizeOrder: false             // Set true for random board order
  },

  // ─── ADVANCED (rarely changed) ───
  getAction: "getMenu",
  setAction: "setMenu",
  method: "POST",
  mode: "cors"
};

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL: Override any setting per deployment (e.g. staging vs production)
// ─────────────────────────────────────────────────────────────────────────────

// Example staging override:
// if (window.location.hostname === "staging.mymenuboards.com") {
//   window.MENU_SHEETS_CONFIG.endpoint = "https://script.google.com/macros/s/AKfycbz4rBaKb9IUhopuMGLHEZxbxj2HqqB2LE3R8XIIRFfWqNOiQUksg_gOz79CZQbtEPtg/exec";
//   window.MENU_SHEETS_CONFIG.displayKey = "90210-rAxfyg-5zokpu-ceqpyb";
// }

console.log("%c AccelMenus v2.0 (November 2025) – Secure & Auto-Rotating", "background:#f97316;color:white;font-size:14px;padding:8px 16px;border-radius:8px;");
