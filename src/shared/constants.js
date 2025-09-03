// src/shared/constants.js

// Storage key used in chrome.storage.local
export const STORAGE_KEY = "rw_lists_v3";

// Default starter lists (only names/ids, no timestamps)
// createdAt is assigned in storage.js when seeding.
export const DEFAULT_LISTS = [
  { id: "movies", name: "Movies" },
  { id: "books",  name: "Books" },
  { id: "anime",  name: "Anime" },
];

// Maximum allowed length of a stored title
export const MAX_TITLE_LEN = 120;
