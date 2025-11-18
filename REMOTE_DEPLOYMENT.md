# Remote menu deployment

The "Display link" URL in `admin.html` always points to `index.html` with the current
restaurant and board IDs. That link works immediately on the same computer because
the menu data is stored in the browser's `localStorage`. To make that link usable on
remote displays (another computer, tablet, or smart TV), the menu data must live in a
shared location that every device can reach.

This project already ships with a remote sync layer that talks to a lightweight
Google Apps Script endpoint. Once you publish that endpoint and add its URL to
`window.MENU_SHEETS_CONFIG`, every save in the admin automatically pushes the latest
menu JSON to the script and every display polls for updates. The steps below walk
through the process.

## 1. Publish a Google Apps Script endpoint

1. Create (or open) the Google Sheet that will host your menu data.
2. Choose **Extensions → Apps Script** and replace the default code with the script
   below. Update `AUTH_TOKEN` to a secret string — the same value will be referenced
   from `config.js`.
3. Click **Deploy → Test deployments** to verify the script, then **Deploy → New
   deployment**. Choose **Web app**, set **Execute as** to *Me*, and **Who has
   access** to *Anyone with the link*.
4. Copy the deployment URL (it usually looks like
   `https://script.google.com/macros/s/AKfycb.../exec`).

```javascript
const PROPERTY_KEY = 'MENU_STATE';
const AUTH_TOKEN = 'replace-me';

function buildResponse(data) {
  return ContentService.createTextOutput(JSON.stringify({ menu: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized(payload) {
  if (!AUTH_TOKEN) {
    return true;
  }
  const provided = payload && payload.token;
  return provided && provided === AUTH_TOKEN;
}

function readState() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEY);
  return raw ? JSON.parse(raw) : {};
}

function writeState(state) {
  PropertiesService.getScriptProperties().setProperty(
    PROPERTY_KEY,
    JSON.stringify(state || {})
  );
}

function doGet(e) {
  if (!isAuthorized(e.parameter)) {
    return ContentService.createTextOutput('Unauthorized').setMimeType(
      ContentService.MimeType.TEXT
    ).setResponseCode(403);
  }
  return buildResponse(readState());
}

function doPost(e) {
  const body = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
  if (!isAuthorized(body)) {
    return ContentService.createTextOutput('Unauthorized').setMimeType(
      ContentService.MimeType.TEXT
    ).setResponseCode(403);
  }
  if (body.action === 'setMenu' && body.menu) {
    writeState(body.menu);
    return buildResponse(body.menu);
  }
  return buildResponse(readState());
}
```

## 2. Point the front-end at your endpoint

Edit `config.js` and set the endpoint (and optional token) that the admin and
display pages should use:

```javascript
window.MENU_SHEETS_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfycb-your-id/exec',
  token: 'replace-me',
  pollInterval: 10000,
  timeoutMs: 15000
};
```

When `endpoint` is non-empty the UI switches from browser-only storage to the shared
Google Sheet. Every publish writes through the script and every display polls for the
latest data. The admin UI now surfaces whether remote sync is enabled.

## 3. Deploy the site

Host the contents of this repository on any static hosting provider (GitHub Pages,
Netlify, Cloudflare Pages, etc.). The `admin.html` link generates URLs that point to
`index.html` with the appropriate query parameters, so any device on the network can
load the correct board as long as it can reach your static site and the Google Apps
Script endpoint.

---

If you ever need to troubleshoot, open the browser console and run
`window.MenuData.syncNow()` to manually force a remote refresh.
