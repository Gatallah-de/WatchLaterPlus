// src/popup/index.js
(function () {
  const $ = (id) => document.getElementById(id);
  const idStr = (x) => (x == null ? "" : String(x));

  /* ----------------------------- state I/O ----------------------------- */
  async function readLocalStateFallback() {
    try {
      const all = await chrome.storage.local.get(null);
      for (const v of Object.values(all)) {
        if (v && Array.isArray(v.items) && Array.isArray(v.lists)) return v;
      }
    } catch {}
    return { version: 3, lists: [], items: [], settings: {} };
  }

  async function bgGetState() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "getState" });
      if (resp?.ok) return resp.state;
      if (resp && resp.items && resp.lists) return resp; // legacy shape
      throw new Error(resp?.error || "getState failed");
    } catch {
      return readLocalStateFallback();
    }
  }

  async function bgDeleteMany(ids) {
    const resp = await chrome.runtime.sendMessage({ type: "deleteMany", ids });
    if (!resp?.ok) throw new Error(resp?.error || "deleteMany failed");
    return resp.deletedCount ?? ids.length;
  }

  /* ------------------------------ local ------------------------------- */
  let state = { lists: [], items: [] };

  // read selection from the DOM (no stale Set)
  const rows = () => [...document.querySelectorAll(".row")];
  const checkedRows = () =>
    rows().filter((r) => {
      const cb = r.querySelector(".row__cb");
      return cb instanceof HTMLInputElement && cb.checked;
    });
  const checkedRealRows = () => checkedRows().filter((r) => r.dataset.real === "true");

  // Never use native disabled; drive visuals via ARIA/class only
  function setBulkEnabled(enabled) {
    const btn = $("#bulkDelete");
    if (!btn) return;

    if (btn.disabled) btn.disabled = false; // ensure it's clickable for our handler

    if (enabled) {
      btn.removeAttribute("aria-disabled");
      btn.classList.add("is-enabled");
      btn.classList.remove("is-disabled");
      btn.style.removeProperty("opacity");
    } else {
      btn.setAttribute("aria-disabled", "true");
      btn.classList.remove("is-enabled");
      btn.classList.add("is-disabled");
      // dim only; leave cursor alone
      btn.style.opacity = "0.55";
    }
    // Optional live region update if present
    const sr = $("#bulkStatus");
    if (sr) sr.textContent = enabled ? "Bulk delete enabled" : "Bulk delete disabled";
  }

  function updateBulk() {
    setBulkEnabled(checkedRealRows().length > 0);
  }

  /* ----------------------------- mount/root ---------------------------- */
  function ensureRoot() {
    let root = $("#items");
    if (!root) {
      root = document.createElement("section");
      root.id = "popup-root";
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", "Saved items");
      document.body.innerHTML = `
        <div class="popup" role="application" aria-label="WatchLater+">
          <div class="header">
            <strong>WatchLater+</strong>
            <button id="openOptions" type="button" title="Open settings" aria-label="Open settings" class="icon-btn">⚙️</button>
          </div>
          <div class="actions" role="group" aria-label="Bulk actions">
            <button id="bulkDelete" type="button" aria-disabled="true" class="is-disabled">Delete selected</button>
            <span id="bulkStatus" class="sr-only" aria-live="polite"></span>
          </div>
        </div>
      `;
      document.querySelector(".popup").appendChild(root);
    }
    return root;
  }

  /* ------------------------------ id helpers --------------------------- */
  // Only treat stable fields as real IDs
  function getItemId(it, idx) {
    const cand =
      it?.id ?? it?._id ?? it?.uuid ?? it?.uid ?? it?.key ?? it?.itemId ?? null;
    const s = cand != null ? idStr(cand) : "";
    return s ? { id: s, real: true } : { id: `__idx_${idx}`, real: false };
  }

  /* -------------------------------- render ----------------------------- */
  function render() {
    const root = ensureRoot();
    root.innerHTML = "";

    const nameById = new Map(
      (state.lists || []).map((l) => [idStr(l.id ?? l._id ?? ""), l.name ?? "(unnamed)"])
    );

    const items = Array.isArray(state.items) ? state.items : [];
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "sub";
      p.style.padding = "10px 0";
      p.textContent = "No items yet. Select text on a page, right-click, and add to a list.";
      root.appendChild(p);
      updateBulk();
      return;
    }

    for (const [idx, it] of items.entries()) {
      const { id, real } = getItemId(it, idx);
      const title = it?.title || it?.text || it?.name || "(untitled)";
      const lid = idStr(it?.listId ?? it?.list_id ?? it?.list ?? "");

      const row = document.createElement("div");
      row.className = "row";
      row.dataset.id = id;
      row.dataset.real = real ? "true" : "false";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "row__cb";
      cb.setAttribute("aria-label", "Select item");
      row.appendChild(cb);

      const info = document.createElement("div");
      const t = document.createElement("div");
      t.className = "title";
      t.title = title;
      t.textContent = title;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = nameById.get(lid) || lid || "(no list)";
      info.appendChild(t);
      info.appendChild(sub);
      row.appendChild(info);

      const del = document.createElement("button");
      del.className = "del";
      del.title = real ? "Delete" : "Cannot delete (no id)";
      del.textContent = "✕";
      if (!real) del.setAttribute("aria-disabled", "true");
      row.appendChild(del);

      root.appendChild(row);
    }

    updateBulk();
  }

  /* --------------------------------- load ------------------------------ */
  async function load() {
    try {
      const st = await bgGetState();
      if (!st || !Array.isArray(st.items) || !Array.isArray(st.lists)) throw new Error("Bad state");
      state = st;
      render();
    } catch (e) {
      const root = ensureRoot();
      root.innerHTML = "";
      const err = document.createElement("div");
      err.className = "sub";
      err.style.cssText = "padding:10px 0;color:#f87171";
      err.textContent = "Failed to load data. Check Service Worker console.";
      root.appendChild(err);
      updateBulk();
      console.error("[popup] load failed:", e);
    }
  }

  /* -------------------------------- actions ---------------------------- */
  async function deleteSelected(ids = null) {
    let idsToDelete = [];

    if (Array.isArray(ids) && ids.length) {
      idsToDelete = ids.filter(Boolean);
    } else {
      const realChecked = checkedRealRows();
      idsToDelete = realChecked.map((r) => r.dataset.id).filter(Boolean);
    }

    if (!idsToDelete.length) return;

    try {
      const resp = await chrome.runtime.sendMessage({ type: "deleteMany", ids: idsToDelete });
      if (!resp?.ok) await bgDeleteMany(idsToDelete);
    } catch {
      await bgDeleteMany(idsToDelete);
    } finally {
      await load();
    }
  }

  /* -------------------------- delegated listeners ---------------------- */
  function wireDelegatedEvents() {
    document.addEventListener("click", (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;

      // open options
      if (el.id === "openOptions" || el.closest("#openOptions")) {
        try {
          chrome.runtime.openOptionsPage(() => {
            if (chrome.runtime.lastError) {
              chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html") });
            }
          });
        } catch {
          chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html") });
        }
        return;
      }

      // bulk delete
      if (el.id === "bulkDelete" || el.closest("#bulkDelete")) {
        e.preventDefault();
        const disabled = $("#bulkDelete")?.getAttribute("aria-disabled") === "true";
        if (!disabled) deleteSelected().catch(() => {});
        return;
      }

      // per-row delete
      if (el.classList.contains("del")) {
        const row = el.closest(".row");
        const id = row?.dataset.id || "";
        const real = row?.dataset.real === "true";
        const btnDisabled = el.getAttribute("aria-disabled") === "true";
        if (real && id && !btnDisabled) {
          e.stopPropagation();
          deleteSelected([id]).catch(() => {});
        }
        return;
      }

      // toggle checkbox on row click (not on delete/checkbox itself)
      const row = el.closest(".row");
      if (row && !(el.classList.contains("del") || el.classList.contains("row__cb"))) {
        const cb = row.querySelector(".row__cb");
        if (cb instanceof HTMLInputElement) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("input", { bubbles: true }));
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });

    // enable/disable bulk based on checkbox changes
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "checkbox" || !el.classList.contains("row__cb")) return;
      updateBulk();
    });

    // keyboard bulk
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && checkedRealRows().length > 0) {
        e.preventDefault();
        deleteSelected().catch(() => {});
      }
    });
  }

  /* ---------------------------------- init ----------------------------- */
  function init() {
    wireDelegatedEvents();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
