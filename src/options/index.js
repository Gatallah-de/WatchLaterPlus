import { readState, writeState, createList, loadState } from "./state.js";
import { $, sanitizeName } from "./dom.js";
import { showNameModal } from "./modal.js";
import { renderLists } from "./render.js";

/* ------------------------------ interactions ----------------------------- */

let listenersBound = false;

function bindEvents() {
  if (listenersBound) return;
  listenersBound = true;

  const form = $("newListForm");
  /** @type {HTMLInputElement|null} */
  const input = $("newListName");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Prefer inline modal if name is empty — cleaner UX than native prompt
      let name = sanitizeName(input?.value ?? "");
      if (!name) {
        name = sanitizeName((await showNameModal({ defaultValue: "" })) || "");
      }
      if (!name) return;

      try {
        await createList(name);
        if (input) input.value = "";
      } catch (err) {
        console.error("[options] Create list failed:", err);
        alert("Could not create list.");
      } finally {
        await init();
      }
    });
  }

  if (input && form) {
    // Prevent blank Enter submits
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !input.value.trim()) e.preventDefault();
    });
  }

  const exportJsonBtn = $("exportJson");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      try {
        const st = await readState();
        const text = JSON.stringify(st ?? {}, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "watchlaterplus-backup.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error("[options] Export JSON failed:", err);
        alert("Export failed.");
      }
    });
  }

  const importBtn = $("importBtn");
  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      /** @type {HTMLInputElement|null} */
      const fileInput = $("importFile");
      const file = fileInput?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        await writeState(json);
        alert("Imported successfully.");
      } catch (e) {
        console.error("[options] Import failed:", e);
        alert("Invalid JSON file.");
      } finally {
        await init();
      }
    });
  }

  // Background fallback prompt → show inline modal, then ask BG to create & maybe add
  chrome.runtime?.onMessage?.addListener?.(async (msg) => {
    if (msg?.type !== "promptNewList") return;

    const defaultValue = sanitizeName(msg.defaultValue || "");
    const title = typeof msg.title === "string" ? msg.title : "";

    const val = sanitizeName((await showNameModal({ defaultValue })) || "");
    if (!val) return;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "createListAndMaybeAdd",
        name: val,
        title,
      });
      if (!resp?.ok) throw new Error(resp?.error || "Unknown error");
    } catch (err) {
      console.error("[options] createListAndMaybeAdd failed:", err);
      alert("Could not create list.");
    } finally {
      await init();
    }
  });
}

/* --------------------------------- init ---------------------------------- */

async function init() {
  const st = await loadState();
  renderLists(st, { onItemDeleted: init });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    init();
  });
} else {
  bindEvents();
  init();
}
