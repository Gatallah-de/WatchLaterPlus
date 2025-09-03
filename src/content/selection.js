// src/content/selection.js

/* ------------------------------ utils ------------------------------ */

/** Normalize to a compact, storage-friendly string. */
function cleanText(t) {
  const s = String(t || "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")   // strip zero-widths
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 8000 ? s.slice(0, 7999) + "…" : s;
}

/* ------------------------------ message bus ------------------------------ */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "prompt") {
    try {
      const message = typeof msg.message === "string" ? msg.message : "Enter a value:";
      const resp = window.prompt(message);
      sendResponse(typeof resp === "string" ? cleanText(resp) : null);
    } catch {
      sendResponse(null);
    }
    return; // synchronous
  }


});
