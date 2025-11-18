window.DEFAULT_MENU = {
  title: "Sunny Side Café",
  subtitle: "Locally roasted coffee • Freshly baked pastries",
  sections: [
    {
      name: "Breakfast Classics",
      description: "Served until 11 a.m.",
      items: [
        {
          name: "Buttermilk Pancakes",
          description: "Whipped butter, maple syrup, seasonal fruit",
          price: "9"
        },
        {
          name: "Morning Burrito",
          description: "Farm eggs, black beans, queso fresco, roasted salsa",
          price: "11"
        },
        {
          name: "Avocado Toast",
          description: "Sourdough, smashed avocado, radish, chili oil",
          price: "10"
        }
      ]
    },
    {
      name: "Lunch Favorites",
      description: "Available after 11 a.m.",
      items: [
        {
          name: "Roasted Veggie Bowl",
          description: "Ancient grains, charred broccoli, tahini herb dressing",
          price: "13"
        },
        {
          name: "Citrus Chicken Sandwich",
          description: "Grilled chicken, pickled onion, baby greens, aioli",
          price: "12"
        },
        {
          name: "Seared Salmon Salad",
          description: "Mixed greens, fennel, grapefruit, champagne vinaigrette",
          price: "15"
        }
      ]
    },
    {
      name: "Beverages",
      description: "Available all day",
      items: [
        { name: "Cold Brew", description: "House blend over ice", price: "5" },
        { name: "Seasonal Latte", description: "Ask about our rotating flavors", price: "6" },
        { name: "Fresh Lemonade", description: "Pressed lemons, sparkling water", price: "4" }
      ]
    }
  ],
  backgrounds: [
    {
      id: "bg-sunrise",
      name: "Sunrise Gradient",
      source:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
      origin: "url"
    },
    {
      id: "bg-slate",
      name: "Slate Texture",
      source:
        "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80",
      origin: "url"
    }
  ],
  activeBackgroundId: "bg-sunrise"
};

// Configure the published Google Apps Script URL (and optional settings) that
// backs the shared Google Sheet. Leave the endpoint empty to keep data local.
window.MENU_SHEETS_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbzFvWmidOzlbVJmjpl598hKt_uWhBiNqyl6On7L_BO4z--KpqXgzutQM2Zr8jeKfrOp/exec",
  pollInterval: 10000,
  token: "90210-rAxfyg-5zokpu-ceqpyb",
  timeoutMs: 15000
};
