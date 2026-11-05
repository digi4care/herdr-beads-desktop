import {
  DEFAULT_DETAILS_RATIO,
  normalizeDetailsRatio
} from "./details-layout.js";

export const PROJECT_STATE_STORAGE_KEY = "beads-desktop:project-state";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function toText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeCwd(value) {
  const text = toText(value).trim();
  if (!text) return "";
  let trimmed = text;
  while (trimmed.length > 1 && trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed === "/") return "/";
  return trimmed;
}

/**
 * Stable identity for one project: `machine|workspace|cwd`.
 * Contains no per-tab component, so multiple tabs of the same project share it.
 */
export function projectStateKey({ machine, workspace, cwd } = {}) {
  const safeMachine = toText(machine).trim() || "local";
  const safeWorkspace = toText(workspace).trim();
  const safeCwd = normalizeCwd(cwd);
  const key = `${safeMachine}|${safeWorkspace}|${safeCwd}`;
  return key || "local||";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;
}

function sanitizeEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const result = {};
  if (isValidRatio(entry.detailRatio)) {
    result.detailRatio = normalizeDetailsRatio(entry.detailRatio, DEFAULT_DETAILS_RATIO);
  }
  if (typeof entry.detailsCollapsed === "boolean") {
    result.detailsCollapsed = entry.detailsCollapsed;
  }
  if (!Object.keys(result).length) return null;
  return result;
}

/**
 * Accepts a JSON string or a plain object and returns a sanitized state map:
 * `{ [projectKey]: { detailRatio?, detailsCollapsed? } }`.
 * Never throws, also on null, arrays, broken JSON and prototype-pollution attempts.
 */
export function parseProjectState(raw) {
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!isPlainObject(source)) return {};

  const result = {};
  for (const key of Object.keys(source)) {
    if (!key || UNSAFE_KEYS.has(key)) continue;
    const entry = sanitizeEntry(source[key]);
    if (!entry) continue;
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return result;
}

function serializeEntry(entry) {
  const parts = [];
  if (typeof entry.detailRatio === "number") {
    parts.push(`"detailRatio":${normalizeDetailsRatio(entry.detailRatio, DEFAULT_DETAILS_RATIO)}`);
  }
  if (typeof entry.detailsCollapsed === "boolean") {
    parts.push(`"detailsCollapsed":${entry.detailsCollapsed ? "true" : "false"}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Stable JSON with sorted project keys, so repeated writes are byte-identical.
 */
export function serializeProjectState(state) {
  const sanitized = parseProjectState(state);
  const keys = Object.keys(sanitized).sort();
  if (!keys.length) return "{}";
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${serializeEntry(sanitized[key])}`)
    .join(",");
  return `{${body}}`;
}

function readFromStore(store, key) {
  if (!store || typeof store !== "object") return { ok: false, value: null };
  try {
    if (typeof store.getItem === "function") {
      return { ok: true, value: store.getItem(key) };
    }
    if (typeof store.get === "function") {
      return { ok: true, value: store.get(key) };
    }
  } catch {
    return { ok: false, value: null };
  }
  return { ok: false, value: null };
}

function writeToStore(store, key, serialized) {
  if (!store || typeof store !== "object") return false;
  try {
    if (typeof store.setItem === "function") {
      store.setItem(key, serialized);
      return true;
    }
    if (typeof store.set === "function") {
      store.set(key, serialized);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function readProjectState(storage) {
  const res = readFromStore(storage, PROJECT_STATE_STORAGE_KEY);
  if (!res.ok) return {};
  if (res.value === null || res.value === undefined) return {};
  return parseProjectState(res.value);
}

export function writeProjectState(storage, state) {
  const serialized = serializeProjectState(state);
  return writeToStore(storage, PROJECT_STATE_STORAGE_KEY, serialized);
}

/**
 * Returns `{ detailRatio: null, detailsCollapsed: false }` unless a valid entry exists.
 * `detailRatio` is null when the project has no stored ratio, so callers can migrate
 * from the legacy global key.
 */
export function getProjectLayout(state, projectKey) {
  const empty = { detailRatio: null, detailsCollapsed: false };
  if (typeof projectKey !== "string" || !projectKey) return empty;
  const sanitized = parseProjectState(state);
  const entry = sanitized[projectKey];
  if (!entry) return empty;
  return {
    detailRatio:
      typeof entry.detailRatio === "number" ? entry.detailRatio : null,
    detailsCollapsed:
      typeof entry.detailsCollapsed === "boolean" ? entry.detailsCollapsed : false
  };
}

/**
 * Returns a new state object with the patch merged for that project key, sanitized.
 * A `detailRatio: null` or `undefined` patch never erases an existing ratio.
 */
export function setProjectLayout(state, projectKey, patch) {
  const current = parseProjectState(state);
  const safeKey = typeof projectKey === "string" ? projectKey : "";
  if (!safeKey) return current;

  const existing = current[safeKey] || {};
  const merged = { ...existing };
  const safePatch = isPlainObject(patch) ? patch : {};

  if (isValidRatio(safePatch.detailRatio)) {
    merged.detailRatio = normalizeDetailsRatio(safePatch.detailRatio, DEFAULT_DETAILS_RATIO);
  }
  if (typeof safePatch.detailsCollapsed === "boolean") {
    merged.detailsCollapsed = safePatch.detailsCollapsed;
  }

  const next = { ...current };
  Object.defineProperty(next, safeKey, {
    value: merged,
    enumerable: true,
    writable: true,
    configurable: true
  });
  return parseProjectState(next);
}

/**
 * Migration path from the old global `beads-desktop:details-height-ratio` key:
 * the per-project ratio always wins; the legacy global ratio is only used when
 * the project has no stored ratio yet.
 */
export function resolveProjectDetailRatio({ state, projectKey, legacyRatio } = {}) {
  const layout = getProjectLayout(state, projectKey);
  if (typeof layout.detailRatio === "number") {
    return normalizeDetailsRatio(layout.detailRatio, DEFAULT_DETAILS_RATIO);
  }
  return normalizeDetailsRatio(legacyRatio, DEFAULT_DETAILS_RATIO);
}
