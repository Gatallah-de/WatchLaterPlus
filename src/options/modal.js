// Accessible inline modal for list naming

import { h, sanitizeName } from "./dom.js";

/** Returns Promise<string|null> */
export function showNameModal({ title = "New list name", placeholder = "e.g., Podcasts", defaultValue = "" } = {}) {
  return new Promise((resolve) => {
    const onClose = (value) => {
      cleanup();
      resolve(value);
    };

    const overlay = h("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "wlx-modal-title",
      style: `
        position: fixed; inset: 0; display: grid; place-items: center;
        background: rgba(0,0,0,.45); z-index: 9999; padding: 20px;
      `,
    });

    const card = h(
      "div",
      {
        style: `
          width: min(520px, 92vw);
          background: var(--surface-card, #fff);
          color: var(--text, #111);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px; box-shadow: 0 10px 32px rgba(0,0,0,.18);
          padding: 14px;
        `,
      },
      h("h2", { id: "wlx-modal-title", style: "margin:0 0 8px;font-size:16px;font-weight:600;" }, title),
      h(
        "form",
        { id: "wlx-modal-form", style: "display:flex;gap:8px;align-items:center;margin-top:6px;" },
        h("input", {
          id: "wlx-modal-input",
          type: "text",
          placeholder,
          value: defaultValue,
          "aria-label": "List name",
          required: "",
          style:
            "flex:1;padding:8px 10px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--ctrl-bg,#fff);",
        }),
        h(
          "div",
          { style: "display:flex;gap:8px;" },
          h(
            "button",
            {
              type: "submit",
              class: "btn--primary",
              style: "padding:8px 12px;border-radius:8px;border:1px solid transparent;background:var(--accent,#3366ff);color:#fff;",
            },
            "Add"
          ),
          h(
            "button",
            {
              type: "button",
              id: "wlx-modal-cancel",
              style: "padding:8px 12px;border-radius:8px;",
            },
            "Cancel"
          )
        )
      )
    );

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const input = card.querySelector("#wlx-modal-input");
    const form = card.querySelector("#wlx-modal-form");
    const cancel = card.querySelector("#wlx-modal-cancel");

    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(null); } };
    const onClickOverlay = (e) => { if (e.target === overlay) onClose(null); };
    function cleanup() {
      document.removeEventListener("keydown", onKey);
      overlay.removeEventListener("click", onClickOverlay);
      overlay.remove();
    }

    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", onClickOverlay);
    cancel.addEventListener("click", () => onClose(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = sanitizeName(input.value);
      onClose(val || null);
    });

    setTimeout(() => input?.focus(), 0);
  });
}
