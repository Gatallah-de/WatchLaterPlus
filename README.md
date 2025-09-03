# WatchLater+

**A Chrome (Manifest V3) extension for saving highlighted text into organized lists.**

This repository provides a modular, maintainable extension codebase with background scripts, content scripts, and a structured options page.  
It is written in modern JavaScript (ES modules) with a focus on clean architecture and ease of contribution.

---

## 📂 Project Structure

```

src/
background/      # Background service worker (context menus, messaging)
content/         # Content script (selection reading + in-page prompts)
options/         # Options page (UI for lists, items, backup/restore)
dom.js         # DOM helpers (h(), \$, slugify, downloadFile, etc.)
events.js      # Event binding for forms, export/import, runtime listeners
render.js      # Rendering logic for lists and items
state.js       # State loading and caching
index.js       # Entry point for options page
popup/           # Toolbar popup UI (optional quick access)
shared/          # Shared logic across components
constants.js   # Default values, storage keys
dedupe.js      # Helpers for title normalization & duplicate detection
storage.js     # Storage API (getState, setState, createList, deleteList, etc.)
exporters.js   # JSON/CSV export utilities
assets/            # Icons

````

---

## 🛠 Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Gatallah-de/WatchLaterPlus.git
   cd watchlater-plus
````

2. Load into Chrome:

   * Open `chrome://extensions/`
   * Enable **Developer mode**
   * Click **Load unpacked** → select the project root

3. (Optional) Use a bundler like [Vite](https://vitejs.dev/) or [esbuild](https://esbuild.github.io/) for automatic builds/minification.
   The extension works directly without a build step.

---

## ⚙️ Architecture & Design

* **Manifest V3**

  * Background service worker handles context menus and extension messaging.
  * Uses `"type": "module"` for ES import/export.

* **Storage layer (`shared/storage.js`)**

  * Uses `chrome.storage.local`.
  * Normalization guarantees:

    * Unique, valid list IDs
    * Deduplication (via `dedupe.js`)
    * Default list seeding on first run
  * Core API:

    * `getState()`, `setState(state)`
    * `createList(name)`, `deleteList(id, {cascade, moveToId})`
    * `addItem({listId, title})`, `deleteMany(ids)`

* **Background worker (`background/index.js`)**

  * Initializes and refreshes context menus on install/startup.
  * Handles context menu clicks to add or create lists.
  * Routes messages between popup/options/content.

* **Content script (`content/selection.js`)**

  * Extracts highlighted text or focused input selection.
  * Handles in-page prompts (`window.prompt`).

* **Options page**

  * **render.js**: Renders lists, items, and export buttons.
  * **events.js**: Handles form submissions, import/export, runtime messages.
  * **dom.js**: Utility functions (`h`, `$`, slugify, sanitize, downloadFile).
  * **state.js**: Loads and caches state from storage.
  * Supports list creation, deletion, CSV/JSON export, JSON import.

---

## 🔌 Messaging API

Background worker responds to:

* `getState` → returns normalized state
* `importState` → replace state, refresh menus
* `createList` → create new list
* `deleteList` → delete list (cascade or move items)
* `deleteMany` → delete multiple items
* `createListAndMaybeAdd` → create list and add one item (fallback UX)

---

## 🧑‍💻 Contributing

We welcome contributions! To keep the project consistent and maintainable:

### Workflow

1. Fork the repository
2. Create a feature branch:

   ```bash
   git checkout -b feature/my-change
   ```
3. Commit changes (see style below)
4. Push and open a Pull Request

### Coding Style

* **ES modules** only (`import` / `export`)
* Use **async/await** instead of callbacks
* Keep helpers **pure functions** where possible
* Always **sanitize user input** with `sanitize()` before storing
* Prefer small, single-purpose modules (`dom.js`, `render.js`, etc.)

### Commit Messages

Follow a clear convention:

* `feat: add deleteList support in storage API`
* `fix: normalize titles before CSV export`
* `refactor: split options/index.js into modules`
* `docs: update README with contribution guidelines`

### Pull Requests

* Keep PRs focused (one feature or fix at a time)
* Include screenshots if you change UI
* Ensure menus and storage still function after your change
* Update README if you add/remove a feature

---

## 🚀 Roadmap Ideas

* Chrome sync support (`chrome.storage.sync`)
* Item metadata (URL, notes, tags)
* Enhanced popup (quick view, search)
* Bulk item management (move/copy between lists)
* Test suite for storage normalization and background logic

---

## 📜 License

MIT © 2025 George Atallah
Free to use, modify, and distribute.
