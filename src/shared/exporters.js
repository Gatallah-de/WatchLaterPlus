// src/shared/exporters.js
export function toCSV(
  items,
  {
    includeList = false,
    listNameById = null,
    humanDates = false,
    locale = undefined,           // e.g. "en-GB" | "de-DE" | undefined => browser default
    timeZone = undefined,         // e.g. "UTC" | "Europe/Berlin"
    delimiter = ",",              // RFC 4180 default
    newline = "\r\n",             // CRLF plays nicest with Excel
    includeBom = false,           // prepend BOM so Excel opens UTF-8 correctly

    // NEW (optional):
    // - columns: array of field keys or getter fns. If omitted, falls back to existing schema.
    // - headers: array of header labels matching columns length.
    columns = undefined,
    headers = undefined,
  } = {}
) {
  // --- tiny helpers ---
  const toStr = (x) => (x == null ? "" : String(x));
  const idStr = (x) => (x == null ? "" : String(x));

  // Validate delimiter/newline
  const delim = typeof delimiter === "string" && delimiter.length > 0 ? delimiter : ",";
  const eol =
    newline === "\n" || newline === "\r\n" || newline === "\r"
      ? newline
      : "\r\n";

  // RFC4180-ish escaping:
  // quote if it contains delimiter, CR/LF, quotes, or leading/trailing spaces
  const MUST_QUOTE = /["\r\n]/;
  const esc = (s) => {
    const str = toStr(s);
    const needsQuotes =
      MUST_QUOTE.test(str) ||
      str.includes(delim) ||
      /^\s/.test(str) ||
      /\s$/.test(str);
    if (!needsQuotes) return str;
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Resolve list label via Map or plain object
  const listLabel = (listId) => {
    const lid = idStr(listId);
    if (!lid) return "";
    if (listNameById) {
      if (typeof listNameById.get === "function") {
        return toStr(listNameById.get(lid) ?? lid);
      }
      if (typeof listNameById === "object") {
        return toStr(listNameById[lid] ?? lid);
      }
    }
    return lid;
  };

  // Robust date formatting
  const fmtDate = (ts) => {
    if (ts == null) return "";
    const n = Number(ts);
    const d = new Date(Number.isFinite(n) ? n : ts);
    if (Number.isNaN(d.getTime())) return "";
    if (humanDates) {
      try {
        const opts = timeZone ? { timeZone } : undefined;
        return d.toLocaleString(locale, opts);
      } catch {
        return d.toLocaleString();
      }
    }
    return d.toISOString();
  };

  const rows = Array.isArray(items) ? items : [];

  // Default schema (your current behavior)
  const defaultCols = includeList
    ? [
        ["list", (i) => listLabel(i.listId)],
        ["title", (i) => toStr(i.title || "")],
        ["createdAt", (i) => fmtDate(i.createdAt)],
      ]
    : [
        ["title", (i) => toStr(i.title || "")],
        ["createdAt", (i) => fmtDate(i.createdAt)],
      ];

  // If custom columns provided, normalize to [key, getter] tuples
  let cols;
  if (Array.isArray(columns) && columns.length > 0) {
    cols = columns.map((c) =>
      typeof c === "function" ? ["", c] : [toStr(c), (row) => toStr(row?.[c])]
    );
  } else {
    cols = defaultCols;
  }

  // Header row
  let headerLabels;
  if (Array.isArray(headers) && headers.length === cols.length) {
    headerLabels = headers.map((h) => toStr(h));
  } else {
    headerLabels = cols.map(([label, _getter], idx) => (label || `col${idx + 1}`));
  }

  const lines = [headerLabels.map(esc).join(delim)];

  // Data rows
  for (const i of rows) {
    if (!i) {
      lines.push(cols.map(() => "").join(delim));
      continue;
    }
    const fields = cols.map(([, getter]) => {
      try {
        return esc(getter(i));
      } catch {
        return esc(""); // stay resilient if a getter throws
      }
    });
    lines.push(fields.join(delim));
  }

  const csvCore = lines.join(eol);
  return includeBom ? "\uFEFF" + csvCore : csvCore;
}
