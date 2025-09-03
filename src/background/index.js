// src/background/index.js
import {
  getState,
  setState,
  addItem,
  createList,
  deleteMany,
  deleteList, // NEW
} from "../shared/storage.js";

const DEBUG = false;
const log = (...a) => DEBUG && console.log("[bg]", ...a);

/* ------------------------------- utils -------------------------------- */

const sanitize = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Small “success” badge tick on the action icon for the current tab. */
function tick(tabId) {
  if (!Number.isFinite(tabId)) return;
  try {
    chrome.action.setBadgeText({ text: "✓", tabId });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 900);
  } catch {}
}

/** Quietly send a message to a tab; resolve undefined if no receiver. */
function safeSendToTab(tabId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        if (chrome.runtime.lastError) return resolve(undefined);
        resolve(resp);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/* --------------------------- prompt helpers ---------------------------- */

/** Ask the content script to show a prompt in-page (fast, no extra perms). */
async function promptInTab(tabId, message) {
  const resp = await safeSendToTab(tabId, { type: "prompt", message });
  return typeof resp === "string" ? sanitize(resp) : null;
}

/** Fallback: open Options and ask it to collect a name via runtime message. */
async function promptViaOptionsPage(defaultValue = "", title = "") {
  try {
    await new Promise((res) => {
      chrome.runtime.openOptionsPage(() => res());
    });
  } catch {}
  // Give Options time to mount & register its onMessage handler
  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ type: "promptNewList", defaultValue, title });
    } catch {}
  }, 250);
  return null;
}

/* ---------------------------- context menus ---------------------------- */

function menusRemoveAll() {
  return new Promise((resolve) => {
    try { chrome.contextMenus.removeAll(() => resolve()); } catch { resolve(); }
  });
}

function safeCreate(props) {
  return new Promise((resolve) => {
    try {
      chrome.contextMenus.create(props, () => {
        const msg = chrome.runtime.lastError?.message || "";
        if (msg && !/duplicate id/i.test(msg)) {
          console.warn("contextMenus.create:", msg, props?.id);
        }
        resolve();
      });
    } catch (e) {
      const msg = e?.message || "";
      if (msg && !/duplicate id/i.test(msg)) {
        console.warn("contextMenus.create threw:", msg, props?.id);
      }
      resolve();
    }
  });
}

// Coalesce overlapping refreshes (MV3 workers can wake multiple times).
let menusRefreshing = null;

async function refreshContextMenus() {
  if (menusRefreshing) return menusRefreshing;

  menusRefreshing = (async () => {
    await menusRemoveAll();

    await safeCreate({
      id: "root",
      title: "Add to WatchLater+",
      contexts: ["selection"],
    });

    const state = await getState(); // seeds defaults if missing

    for (const list of state?.lists ?? []) {
      await safeCreate({
        id: `add:${String(list.id)}`,
        parentId: "root",
        title: String(list.name ?? "(unnamed)"),
        contexts: ["selection"],
      });
    }

    await safeCreate({
      id: "new-list",
      parentId: "root",
      title: "➕ New list…",
      contexts: ["selection"],
    });

    log("context menus refreshed");
  })().finally(() => { menusRefreshing = null; });

  return menusRefreshing;
}

// Ensure menus exist whenever the worker wakes/installs.
(async () => {
  try { await refreshContextMenus(); } catch (e) { console.warn("init menus:", e); }
})();
chrome.runtime.onInstalled.addListener(() => {
  refreshContextMenus().catch((e) => console.warn("onInstalled menus:", e));
});
chrome.runtime.onStartup?.addListener(() => {
  refreshContextMenus().catch((e) => console.warn("onStartup menus:", e));
});

/* -------------------- context menu click handling ---------------------- */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  if (!Number.isFinite(tabId)) return;

  const selectedText = sanitize(info?.selectionText || "");

  try {
    if (info.menuItemId === "new-list") {
      // Fast path: prompt inside the page via content script
      const name = await promptInTab(tabId, "New list name:");
      if (name) {
        const newList = await createList(name);
        const listId = (newList && (newList.id ?? newList)) || null;
        if (listId && selectedText) {
          await addItem({ listId: String(listId), title: selectedText });
          tick(tabId);
        }
        await refreshContextMenus();
        return;
      }
      // Fallback: open Options and let it collect the name + selected item
      await promptViaOptionsPage("", selectedText);
      return;
    }

    if (String(info.menuItemId).startsWith("add:")) {
      const listId = String(info.menuItemId).slice(4);
      if (!listId || !selectedText) return;
      await addItem({ listId, title: selectedText });
      tick(tabId);
    }
  } catch (err) {
    console.error("contextMenus.onClicked error:", err);
    try { chrome.action.setBadgeText({ text: "", tabId }); } catch {}
  }
});

/* ---------------- messaging from popup/options/content ----------------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg.type !== "string") {
        sendResponse({ ok: false, error: "No type" });
        return;
      }

      if (msg.type === "getState" || msg.type === "export") {
        const state = await getState();
        sendResponse({ ok: true, state });
        return;
      }

      if (msg.type === "importState") {
        await setState(msg.payload);
        await refreshContextMenus();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "createList") {
        const name = sanitize(msg.name);
        if (!name) {
          sendResponse({ ok: false, error: "Empty name" });
          return;
        }
        const list = await createList(name);
        await refreshContextMenus();
        sendResponse({ ok: true, id: (list?.id ?? list) && String(list?.id ?? list) });
        return;
      }

      if (msg.type === "deleteMany") {
        const ids = Array.isArray(msg.ids) ? msg.ids.filter((x) => x != null).map(String) : [];
        const deletedCount = await deleteMany(ids);
        sendResponse({ ok: true, deletedCount });
        return;
      }

      // Options-page fallback: create list and (optionally) add the item
      if (msg.type === "createListAndMaybeAdd") {
        const name = sanitize(msg.name);
        if (!name) {
          sendResponse({ ok: false, error: "Empty name" });
          return;
        }
        const list = await createList(name);
        const listId = String(list?.id ?? list);

        const title = sanitize(msg.title || "");
        if (title) {
          await addItem({ listId, title });
        }

        await refreshContextMenus();
        sendResponse({ ok: true, id: listId });
        return;
      }

      // NEW: delete a list (cascade or move handled in storage)
      if (msg.type === "deleteList") {
        const id = typeof msg.id === "string" ? msg.id : String(msg.id || "");
        const cascade = msg.cascade !== false; // default true
        const moveToId = typeof msg.moveToId === "string" ? msg.moveToId : null;
        const result = await deleteList(id, { cascade, moveToId });
        if (result.ok) {
          await refreshContextMenus();
          sendResponse({ ok: true, ...result });
        } else {
          sendResponse({ ok: false, error: result.error || "Delete failed" });
        }
        return;
      }

      // Unknown message
      sendResponse({ ok: false, error: "Unhandled type" });
    } catch (err) {
      console.error("Background message error:", err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  // Keep channel open for async work.
  return true;
});
