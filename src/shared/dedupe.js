// src/shared/dedupe.js
import { MAX_TITLE_LEN } from "./constants.js";

const idStr = (x) => (x == null ? "" : String(x));

/**
 * Normalize a title string:
 * - Unicode NFC
 * - Trim outer whitespace
 * - Convert non-breaking/odd spaces to regular spaces
 * - Strip leading/trailing quotes/brackets
 * - Collapse internal whitespace to single spaces
 * - Remove zero-width chars
 * - Truncate by Unicode code points (no surrogate split) to MAX_TITLE_LEN + ellipsis
 */
export function normalizeTitle(text) {
  if (text == null) return "";
  let t = String(text)
    .normalize("NFC")
    // normalize odd spaces first (NBSP etc.) to regular space
    .replace(/\u00A0|\u1680|\u2000-\u200A|\u202F|\u205F|\u3000/g, " ")
    // strip zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    // remove leading quotes/brackets
    .replace(/^['"“”‘’«»\[\(\{\s]+/u, "")
    // remove trailing quotes/brackets
    .replace(/['"“”‘’«»\]\)\}\s]+$/u, "")
    // collapse any whitespace runs
    .replace(/\s+/g, " ");

  // Truncate by code points safely (avoid cutting surrogate pairs)
  const glyphs = Array.from(t);
  if (glyphs.length > MAX_TITLE_LEN) {
    t = glyphs.slice(0, MAX_TITLE_LEN - 1).join("") + "…";
  }
  return t;
}

/** Lowercased, normalized title for comparisons (locale-stable). */
export function normalizedKey(text) {
  return normalizeTitle(text).toLocaleLowerCase("en");
}

/**
 * Items are duplicates if:
 * - listId matches when coerced to string, and
 * - normalized titles match case-insensitively.
 */
export function isDup(a, b) {
  if (!a || !b) return false;
  if (idStr(a.listId) !== idStr(b.listId)) return false;
  return normalizedKey(a.title) === normalizedKey(b.title);
}
