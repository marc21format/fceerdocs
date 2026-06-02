import { defaultState } from './config.js';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampNonNegativeInteger(value, fallback = 0) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeHtmlAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

export function normalizeTextForSearch(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeColumnQuestionGaps(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => /^p\d+-c\d+$/.test(key))
      .map(([key, gap]) => [key, clampNonNegativeInteger(gap, defaultState.pageLayout.questionGap)])
  );
}

export function mergeState(base, incoming) {
  if (Array.isArray(base) || Array.isArray(incoming)) return incoming ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof output[key] === "object" &&
      output[key] !== null
    ) {
      output[key] = mergeState(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function createChoice() {
  return { id: crypto.randomUUID(), text: "" };
}
