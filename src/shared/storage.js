// src/shared/storage.js
import {
  STORAGE_KEY,
  DEFAULT_LISTS,
  MAX_TITLE_LEN,
} from "./constants.js";
import { normalizeTitle as _normalizeTitle, isDup as _isDup } from "./dedupe.js";

/* -------------------------------- helpers -------------------------------- */

const KEY = String(STORAGE_KEY || "__watchlaterplus__");

const toStr = (x) => (x == null ? "" : String(x));
const now = () => Date.now();

const normalizeTitle =
  typeof _normalizeTitle === "function"
    ? _normalizeTitle
    : (s) => toStr(s).normalize("NFC").replace(/\s+/g, " ").trim();

const isDup =
  typeof _isDup === "function"
    ? _isDup
    : (a, b) =>
        !!a &&
        !!b &&
        toStr(a.listId) === toStr(b.listId) &&
        toStr(a.title).toLowerCase() === toStr(b.title).toLowerCase();

function clampTitle(s) {
  const max = Number.isFinite(MAX_TITLE_LEN) ? MAX_TITLE_LEN : 300;
  const t = toStr(s).trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + "…";
}

function makeId(len = 16) {
  try {
    if (globalThis.crypto?.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, len);
    }
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
  } catch {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, len);
  }
}

/* ------------------------ chrome.storage wrappers ------------------------ */

function getLocal(key) {
  return new Promise((resolve) => {
    try {
      const maybe = chrome.storage?.local?.get?.(key);
      if (maybe && typeof maybe.then === "function") {
        maybe.then((obj) => resolve(obj?.[key])).catch(() => resolve(undefined));
      } else {
        chrome.storage.local.get(key, (obj) => resolve(obj?.[key]));
      }
    } catch {
      resolve(undefined);
    }
  });
}

function setLocal(key, value) {
  return new Promise((resolve) => {
    try {
      const maybe = chrome.storage?.local?.set?.({ [key]: value });
      if (maybe && typeof maybe.then === "function") {
        maybe.then(() => resolve(true)).catch(() => resolve(false));
      } else {
        chrome.storage.local.set({ [key]: value }, () => resolve(!chrome.runtime.lastError));
      }
    } catch {
      resolve(false);
    }
  });
}

function deepClone(x) {
  try {
    return x ? JSON.parse(JSON.stringify(x)) : x;
  } catch {
    return x;
  }
}

/* ----------------------------- normalization ---------------------------- */

function seedDefaultLists() {
  const ts = now();
  const src = Array.isArray(DEFAULT_LISTS) && DEFAULT_LISTS.length
    ? DEFAULT_LISTS
    : [{ id: "watch", name: "Watch" }, { id: "read", name: "Read" }];

  return src.map((l) => ({
    id: toStr(l.id) || makeId(12),
    name: toStr(l.name || "").trim() || "(unnamed)",
    createdAt: Number.isFinite(l.createdAt) ? l.createdAt : ts,
  }));
}

function ensureUniqueListIds(lists) {
  const seen = new Set();
  return lists.map((l) => {
    let id = toStr(l.id) || makeId(12);
    if (!seen.has(id)) {
      seen.add(id);
      return { ...l, id };
    }
    let n = 1;
    let next = `${id}-${n}`;
    while (seen.has(next)) next = `${id}-${++n}`;
    seen.add(next);
    return { ...l, id: next };
  });
}

/** Normalize raw state read from storage. Never drops items; remaps listId when needed. */
function normalizeState(raw) {
  const original = (raw && typeof raw === "object") ? raw : {};
  let changed = false;

  // --- lists
  const sourceLists = Array.isArray(original.lists) ? original.lists : [];
  const cleanedLists = sourceLists
    .filter((l) => l && (l.id != null || l.name != null))
    .map((l) => ({
      id: toStr(l.id) || makeId(12),
      name: toStr(l.name || "").trim() || "(unnamed)",
      createdAt: Number.isFinite(l.createdAt) ? l.createdAt : now(),
    }));

  let lists;
  if (cleanedLists.length === 0) {
    lists = seedDefaultLists();
    changed = true;
  } else {
    lists = ensureUniqueListIds(cleanedLists);
    if (lists.length !== cleanedLists.length) changed = true;
  }

  // --- items: keep everything, remap unknown/missing listId to first list
  const listIdSet = new Set(lists.map((l) => l.id));
  const rawItems = Array.isArray(original.items) ? original.items : [];

  const items = rawItems
    .filter((it) => it && (it.id != null || it.title != null))
    .map((it) => {
      const id = toStr(it.id) || makeId(16);
      const listId = toStr(it.listId);
      const title = clampTitle(normalizeTitle(it.title || ""));
      const createdAt = Number.isFinite(it.createdAt) ? it.createdAt : now();
      return { id, listId, title, createdAt };
    })
    .map((it) => {
      if (!it.listId || !listIdSet.has(it.listId)) {
        changed = true;
        return { ...it, listId: lists[0].id };
      }
      return it;
    });

  if (items.length !== rawItems.length) changed = true;

  // --- settings (no defaults anymore)
  const settings = { ...(original.settings || {}) };

  // --- version
  const version = Number.isFinite(original.version) ? original.version : 3;
  if (version !== original.version) changed = true;

  return { state: { version, lists, items, settings }, changed };
}

/* ---------------------------------- API --------------------------------- */

export async function getState() {
  const raw = await getLocal(KEY);
  const { state, changed } = normalizeState(raw);
  if (!raw || changed) {
    await setLocal(KEY, state);
  }
  return deepClone(state);
}

export async function setState(state) {
  if (!state || typeof state !== "object") {
    console.warn("[storage] setState called with invalid state:", state);
    return false;
  }
  const normalized = normalizeState(state).state;
  return await setLocal(KEY, normalized);
}

export async function createList(name) {
  const st = await getState();
  const cleanName = toStr(name).trim();
  if (!cleanName) return null;

  // derive id from name; ensure uniqueness among existing list IDs
  const base = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
  const existing = new Set(st.lists.map((l) => l.id));
  let id = base, n = 1;
  while (existing.has(id)) id = `${base}-${n++}`;

  const list = { id, name: cleanName, createdAt: now() };
  st.lists.push(list);
  await setLocal(KEY, st);
  return deepClone(list);
}

export async function addItem({ listId, title, createdAt }) {
  const st = await getState();
  const lid = toStr(listId);
  if (!lid) return null;

  if (!st.lists.some((l) => l.id === lid)) {
    console.warn("[storage] addItem: unknown listId", lid);
    return null;
  }

  const cleanedTitle = clampTitle(normalizeTitle(title || ""));
  if (!cleanedTitle) return null;

  const item = {
    id: makeId(16),
    listId: lid,
    title: cleanedTitle,
    createdAt: Number.isFinite(createdAt) ? createdAt : now(),
  };

  const dup = st.items.find((x) => isDup(x, item));
  if (dup) return deepClone(dup);

  st.items.unshift(item);
  await setLocal(KEY, st);
  return deepClone(item);
}

export async function deleteMany(ids) {
  const S = new Set((Array.isArray(ids) ? ids : []).map(toStr).filter(Boolean));
  if (S.size === 0) return 0;

  const st = await getState();
  const before = st.items.length;
  st.items = st.items.filter((i) => !S.has(toStr(i.id)));
  const deletedCount = before - st.items.length;

  if (deletedCount > 0) await setLocal(KEY, st);
  return deletedCount;
}

/**
 * Delete a list, optionally cascading item deletion or moving items.
 * @param {string} listId
 * @param {{ cascade?: boolean, moveToId?: string|null }} opts
 * @returns {Promise<{ok: true, moved: number, deleted: number, destId: string|null} | {ok:false, error:string}>}
 */
export async function deleteList(listId, { cascade = true, moveToId = null } = {}) {
  const lid = toStr(listId);
  if (!lid) return { ok: false, error: "No listId" };

  const st = await getState();
  const idx = st.lists.findIndex((l) => toStr(l.id) === lid);
  if (idx === -1) return { ok: false, error: "Unknown listId" };

  // Prevent deleting the last remaining list
  if (st.lists.length <= 1) {
    return { ok: false, error: "Cannot delete the last list" };
  }

  // Determine destination if not cascading
  let destId = null;
  if (!cascade) {
    const candidate = toStr(moveToId);
    const exists =
      candidate &&
      st.lists.some((l, i) => i !== idx && toStr(l.id) === candidate);
    if (exists) {
      destId = candidate;
    } else {
      // fallback to the first remaining list
      const other = st.lists.find((_, i) => i !== idx);
      destId = toStr(other?.id);
    }
  }

  // Remove the list
  st.lists.splice(idx, 1);

  // Reassign or drop items
  let moved = 0;
  let deleted = 0;
  if (cascade) {
    const before = st.items.length;
    st.items = st.items.filter((it) => toStr(it.listId) !== lid);
    deleted = before - st.items.length;
  } else if (destId) {
    for (const it of st.items) {
      if (toStr(it.listId) === lid) {
        it.listId = destId;
        moved++;
      }
    }
  }

  await setLocal(KEY, st);
  return { ok: true, moved, deleted, destId: cascade ? null : destId };
}
