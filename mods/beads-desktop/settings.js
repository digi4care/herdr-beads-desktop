export const SETTINGS_SHARED_KEY = "beads-desktop:settings";

export const DEFAULT_SETTINGS = Object.freeze({
  fontScale: 1,
  buttonVariant: "ghost",
  buttonContent: "text",
  detailsRender: "rendered",
  mermaidRender: false,
  viewMode: "list",
  sortMode: "default"
});

export const FONT_SCALES = Object.freeze([0.9, 1, 1.15]);

const BUTTON_VARIANTS = ["ghost", "solid"];
const BUTTON_CONTENTS = ["text", "icon"];
const DETAILS_RENDER_MODES = ["rendered", "raw"];
const VIEW_MODES = ["list", "card"];
const SORT_MODES = ["default", "priority", "newest", "oldest", "updated"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickEnum(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function pickFontScale(value, fallback) {
  let numeric = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    numeric = Number(trimmed);
  }
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return fallback;
  return FONT_SCALES.includes(numeric) ? numeric : fallback;
}

function pickBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSettings(raw) {
  if (!isPlainObject(raw)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    fontScale: pickFontScale(raw.fontScale, DEFAULT_SETTINGS.fontScale),
    buttonVariant: pickEnum(
      raw.buttonVariant,
      BUTTON_VARIANTS,
      DEFAULT_SETTINGS.buttonVariant
    ),
    buttonContent: pickEnum(
      raw.buttonContent,
      BUTTON_CONTENTS,
      DEFAULT_SETTINGS.buttonContent
    ),
    detailsRender: pickEnum(
      raw.detailsRender,
      DETAILS_RENDER_MODES,
      DEFAULT_SETTINGS.detailsRender
    ),
    mermaidRender: pickBoolean(raw.mermaidRender, DEFAULT_SETTINGS.mermaidRender),
    viewMode: pickEnum(raw.viewMode, VIEW_MODES, DEFAULT_SETTINGS.viewMode),
    sortMode: pickEnum(raw.sortMode, SORT_MODES, DEFAULT_SETTINGS.sortMode)
  };
}

export function mergeSettings(current, patch) {
  const base = normalizeSettings(current);
  if (!isPlainObject(patch)) {
    return base;
  }

  const merged = { ...base };
  const fields = Object.keys(DEFAULT_SETTINGS);

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field];
    if (value === null || value === undefined) continue;
    merged[field] = normalizeSettings({ [field]: value })[field];
  }

  return merged;
}

export function parseSettings(raw) {
  if (typeof raw === "string") {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
    return normalizeSettings(parsed);
  }
  return normalizeSettings(raw);
}

export function serializeSettings(settings) {
  const normalized = normalizeSettings(settings);
  const ordered = {
    fontScale: normalized.fontScale,
    buttonVariant: normalized.buttonVariant,
    buttonContent: normalized.buttonContent,
    detailsRender: normalized.detailsRender,
    mermaidRender: normalized.mermaidRender,
    viewMode: normalized.viewMode,
    sortMode: normalized.sortMode
  };
  return JSON.stringify(ordered);
}

export function scaleFont(size, scale) {
  const numericSize = typeof size === "number" ? size : Number(size);
  const numericScale = typeof scale === "number" ? scale : Number(scale);

  if (!Number.isFinite(numericSize) || !Number.isFinite(numericScale)) {
    return size;
  }

  return Math.max(9, Math.round(numericSize * numericScale));
}

export function settingsEqual(a, b) {
  const left = normalizeSettings(a);
  const right = normalizeSettings(b);

  return Object.keys(DEFAULT_SETTINGS).every((field) => left[field] === right[field]);
}
