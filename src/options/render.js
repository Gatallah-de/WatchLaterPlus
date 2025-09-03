// Rendering for the lists UI (CSV export + per-item delete)

import { toCSV } from "../shared/exporters.js";
import { deleteMany } from "../shared/storage.js";
import { $, h, idStr, slugify, downloadFile } from "./dom.js";

/**
 * Render the lists + items.
 * @param {object} state - {lists, items}
 * @param {{ onItemDeleted: () => Promise<void> | void }} [handlers]
 */
export function renderLists(state, handlers = {}) {
  const box = $("lists");
  if (!box) return;

  const { onItemDeleted } = handlers;

  box.setAttribute("aria-busy", "true");
  box.innerHTML = "";

  const lists = Array.isArray(state?.lists) ? state.lists : [];
  const items = Array.isArray(state?.items) ? state.items : [];

  const byList = new Map(lists.map((l) => [idStr(l.id), []]));
  for (const it of items) {
    const lid = idStr(it?.listId);
    if (!lid) continue;
    const arr = byList.get(lid);
    if (arr) arr.push(it);
  }

  if (!lists.length) {
    box.appendChild(h("p", { class: "host" }, "No lists yet. Create your first one below."));
  }

  const frag = document.createDocumentFragment();

  for (const l of lists) {
    const lid = idStr(l.id);
    const group = byList.get(lid) || [];
    const safeName = slugify(l.name);

    const header = h(
      "div",
      { class: "list-header", style: "display:flex;align-items:center;justify-content:space-between;gap:8px;" },
      h("h3", { style: "margin:0;" }, l.name ?? "(unnamed)"),
      h(
        "div",
        { style: "display:flex; gap:8px; align-items:center;" },
        h(
          "button",
          {
            class: "mini",
            title: `Export ${l.name ?? "list"} as CSV`,
            onClick: () => {
              if (!group.length) return;
              const csv = toCSV(group, { includeList: false });
              downloadFile(`${safeName}.csv`, csv, "text/csv");
            },
          },
          "Export CSV"
        ),
        h(
          "button",
          {
            class: "mini danger",
            title: `Delete list${group.length ? " and its items" : ""}`,
            onClick: async () => {
              const msg = group.length
                ? `Delete “${l.name}” and ${group.length} item(s)? This cannot be undone.`
                : `Delete “${l.name}”?`;
              if (!confirm(msg)) return;
              try {
                const resp = await chrome.runtime.sendMessage({
                  type: "deleteList",
                  id: l.id,
                  cascade: true, // set to false if you later add a move-to UI
                });
                if (!resp?.ok) throw new Error(resp?.error || "Delete failed");
              } catch (e) {
                console.error("[options] deleteList failed:", e);
                alert("Could not delete list.");
              } finally {
                await onItemDeleted?.();
              }
            },
          },
          "Delete List"
        )
      )
    );

    const section = h("section", {}, header, h("ul"));
    const ul = section.querySelector("ul");

    if (!group.length) {
      ul.appendChild(h("li", { class: "host" }, "(empty)"));
    } else {
      for (const it of group) {
        const title = typeof it?.title === "string" ? it.title : "(untitled)";
        const itemId = idStr(it?.id);
        ul.appendChild(
          h(
            "li",
            {},
            h("span", {}, title),
            " ",
            h(
              "button",
              {
                class: "item-delete",
                title: "Delete this item",
                onClick: async () => {
                  if (!itemId) return;
                  try {
                    await deleteMany([itemId]);
                  } catch (e) {
                    console.error("[options] Delete failed:", e);
                    alert("Delete failed. See console for details.");
                  } finally {
                    await onItemDeleted?.();
                  }
                },
              },
              "✕"
            )
          )
        );
      }
    }

    frag.appendChild(section);
  }

  box.appendChild(frag);
  box.removeAttribute("aria-busy");

  // Export-all button (outside list loop)
  const exportAllBtn = $("exportCsvAll");
  if (exportAllBtn) {
    const listNameById = new Map(lists.map((l) => [idStr(l.id), l.name]));
    exportAllBtn.onclick = () => {
      if (!items.length) return;
      const csv = toCSV(items, { includeList: true, listNameById });
      downloadFile("all-lists.csv", csv, "text/csv");
    };
  }
}
