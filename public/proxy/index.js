"use strict";
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const tabRow = document.getElementById("tab-row");
const stage = document.getElementById("browser-stage");
const homePage = document.getElementById("home-page");
const homeForm = document.getElementById("home-form");
const homeAddress = document.getElementById("home-address");
const newTabButton = document.getElementById("new-tab");
const backButton = document.getElementById("back");
const forwardButton = document.getElementById("forward");
const reloadButton = document.getElementById("reload");
const homeButton = document.getElementById("home");

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: { wasm: "/scram/scramjet.wasm.wasm", all: "/scram/scramjet.all.js", sync: "/scram/scramjet.sync.js" }
});
scramjet.init();
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let initialized = false;

function makeTab() {
  const tab = { id: nextTabId++, title: "New tab", url: "", frame: null, history: [], historyIndex: -1 };
  tabs.push(tab);
  activateTab(tab.id);
  renderTabs();
  showHome();
  return tab;
}
function activeTab() { return tabs.find(t => t.id === activeTabId) || null; }
function activateTab(id) {
  activeTabId = id;
  for (const t of tabs) if (t.frame) t.frame.frame.classList.toggle("active-frame", t.id === id);
  renderTabs();
  const tab = activeTab();
  address.value = tab?.url || "";
  backButton.disabled = !tab || tab.historyIndex <= 0;
  forwardButton.disabled = !tab || tab.historyIndex >= tab.history.length - 1;
  if (!tab || !tab.frame || !tab.url) showHome();
  else hideHome();
}
function renderTabs() {
  tabRow.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement("div");
    item.className = "tab" + (tab.id === activeTabId ? " selected" : "");
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(tab.id === activeTabId));
    const select = document.createElement("button");
    select.className = "tab-title";
    select.textContent = tab.title || "New tab";
    select.title = tab.url || "New tab";
    select.addEventListener("click", () => activateTab(tab.id));
    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";
    close.setAttribute("aria-label", "Close " + (tab.title || "tab"));
    close.addEventListener("click", e => { e.stopPropagation(); closeTab(tab.id); });
    item.append(select, close);
    tabRow.append(item);
  }
}
function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  const [tab] = tabs.splice(idx, 1);
  if (tab.frame) tab.frame.frame.remove();
  if (!tabs.length) { makeTab(); return; }
  if (activeTabId === id) activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else renderTabs();
}
function showHome() {
  homePage.classList.remove("hidden");
  for (const t of tabs) if (t.frame) t.frame.frame.classList.remove("active-frame");
}
function hideHome() { homePage.classList.add("hidden"); }
async function ensureProxyReady() {
  if (!initialized) {
    try { await registerSW(); }
    catch (err) { error.textContent = "Failed to register service worker."; errorCode.textContent = String(err); throw err; }
    const wispUrl = "wss://scramjet-app-v2ib.onrender.com/wisp/";
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
      await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
    }
    initialized = true;
  }
}
async function navigate(raw, { addHistory = true } = {}) {
  const tab = activeTab() || makeTab();
  const value = raw.trim();
  if (!value) return;
  error.textContent = ""; errorCode.textContent = "";
  const url = search(value, searchEngine.value);
  address.value = url;
  try {
    await ensureProxyReady();
    if (!tab.frame) {
      tab.frame = scramjet.createFrame();
      tab.frame.frame.classList.add("proxy-frame");
      tab.frame.frame.title = "Browsing tab";
      stage.appendChild(tab.frame.frame);
    }
    for (const t of tabs) if (t.frame) t.frame.frame.classList.toggle("active-frame", t.id === tab.id);
    hideHome();
    tab.frame.go(url);
    tab.url = url;
    try { tab.title = new URL(url).hostname || "Page"; } catch { tab.title = "Page"; }
    if (addHistory) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(url);
      tab.historyIndex = tab.history.length - 1;
    }
    renderTabs();
    backButton.disabled = tab.historyIndex <= 0;
    forwardButton.disabled = true;
  } catch (err) {
    error.textContent = "Couldn't open that page.";
    errorCode.textContent = String(err);
  }
}
form.addEventListener("submit", e => { e.preventDefault(); navigate(address.value); });
homeForm.addEventListener("submit", e => { e.preventDefault(); navigate(homeAddress.value); });
newTabButton.addEventListener("click", () => makeTab());
backButton.addEventListener("click", () => {
  const t = activeTab(); if (!t || t.historyIndex <= 0) return;
  t.historyIndex--; navigate(t.history[t.historyIndex], { addHistory: false });
  backButton.disabled = t.historyIndex <= 0; forwardButton.disabled = false;
});
forwardButton.addEventListener("click", () => {
  const t = activeTab(); if (!t || t.historyIndex >= t.history.length - 1) return;
  t.historyIndex++; navigate(t.history[t.historyIndex], { addHistory: false });
  backButton.disabled = t.historyIndex <= 0; forwardButton.disabled = t.historyIndex >= t.history.length - 1;
});
reloadButton.addEventListener("click", () => { const t = activeTab(); if (t?.url) navigate(t.url, { addHistory: false }); });
homeButton.addEventListener("click", () => { address.value = ""; showHome(); });
// Category filters and quick-launch tiles navigate inside the active Projection Proxy tab.
const categoryButtons = document.querySelectorAll(".category-button");
const quickSites = document.querySelectorAll(".quick-site");
for (const button of categoryButtons) {
  button.addEventListener("click", () => {
    const category = button.dataset.category;
    for (const item of categoryButtons) {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
    }
    for (const site of quickSites) {
      site.hidden = !site.dataset.category.split(" ").includes(category);
    }
  });
}
for (const site of quickSites) {
  site.addEventListener("click", () => navigate(site.dataset.url));
}
makeTab();
