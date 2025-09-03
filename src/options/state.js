// State cache + storage re-exports

import {
  getState as _readState,
  setState as _writeState,
  createList as _createList,
  deleteMany as _deleteMany,
} from "../shared/storage.js";

let cached = { lists: [], items: [] };

/** Loads and normalizes state; never throws. */
export async function loadState() {
  try {
    const st = await _readState();
    const lists = Array.isArray(st?.lists) ? st.lists : [];
    const items = Array.isArray(st?.items) ? st.items : [];
    cached = { ...st, lists, items };
    return cached;
  } catch (e) {
    console.error("[options] loadState failed:", e);
    cached = { lists: [], items: [] };
    return cached;
  }
}

export function getCached() {
  return cached;
}

// Re-export storage API (so callers can import from one place if they like)
export const readState = _readState;
export const writeState = _writeState;
export const createList = _createList;
export const deleteMany = _deleteMany;
