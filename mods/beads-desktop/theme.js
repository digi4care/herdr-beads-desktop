/**
 * Pure Herdr theme-token helpers for the Beads desktop mod.
 *
 * Every returned color comes exclusively from the active Herdr `theme()` token
 * map (or a `gpui-base` `{ colors }` projection). No hardcoded hex/rgb values
 * or fixed palettes exist in this module.
 */

function normalizeThemeMap(rawTheme) {
  if (!rawTheme || typeof rawTheme !== "object") return {};
  if (rawTheme.colors && typeof rawTheme.colors === "object") {
    return { ...rawTheme.colors, ...rawTheme };
  }
  return rawTheme;
}

function readToken(themeMap, key) {
  const value = themeMap?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickToken(themeMap, candidates) {
  for (const key of candidates) {
    const token = readToken(themeMap, key);
    if (token !== null) return token;
  }
  for (const value of Object.values(themeMap)) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickDistinctToken(themeMap, candidates, usedTokens) {
  for (const key of candidates) {
    const token = readToken(themeMap, key);
    if (token !== null && !usedTokens.has(token)) {
      usedTokens.add(token);
      return token;
    }
  }
  const fallback = pickToken(themeMap, candidates);
  if (fallback !== undefined) {
    usedTokens.add(fallback);
  }
  return fallback;
}

function normalizePriorityLevel(priority) {
  if (typeof priority === "number" && Number.isInteger(priority) && priority >= 0 && priority <= 4) {
    return priority;
  }
  if (typeof priority === "string") {
    const match = /^p?([0-4])$/i.exec(priority.trim());
    if (match) return Number(match[1]);
  }
  return 4;
}

function normalizeStatusKey(status) {
  if (typeof status !== "string") return "open";
  const cleaned = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return cleaned || "open";
}

function normalizeTypeKey(issueType) {
  if (typeof issueType !== "string") return "task";
  const cleaned = issueType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!cleaned) return "task";
  if (cleaned === "bug" || cleaned === "fix" || cleaned === "hotfix" || cleaned === "defect" || cleaned === "incident") {
    return "bug";
  }
  if (cleaned === "feature" || cleaned === "feat" || cleaned === "enhancement" || cleaned === "story" || cleaned === "user_story") {
    return "feature";
  }
  if (cleaned === "epic" || cleaned === "milestone" || cleaned === "initiative") {
    return "epic";
  }
  if (cleaned === "task" || cleaned === "subtask" || cleaned === "todo" || cleaned === "action") {
    return "task";
  }
  return "chore";
}

function pickContrastingSurface(themeMap, foregroundToken, surfaceCandidates) {
  for (const key of surfaceCandidates) {
    const token = readToken(themeMap, key);
    if (token !== null && token !== foregroundToken) {
      return token;
    }
  }
  return pickToken(themeMap, surfaceCandidates);
}

const PRIORITY_CANDIDATES = Object.freeze([
  ["ansi1", "blocked", "destructive", "accent", "foreground"],
  ["blocked", "ansi3", "working", "ansi9", "accent", "foreground"],
  ["accent", "ansi4", "primary", "solid", "foreground"],
  ["muted", "idle", "ansi6", "secondary_foreground", "foreground"],
  ["dim", "unknown", "ansi8", "muted", "border", "foreground"]
]);

function resolvePriorityMap(themeMap) {
  const used = new Set();
  return PRIORITY_CANDIDATES.map((candidates) => pickDistinctToken(themeMap, candidates, used));
}

/**
 * Resolve the complete set of semantic theme tokens used by the mod.
 *
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function resolveThemeTokens(rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);

  const background = pickToken(t, ["background", "canvas", "surface"]);
  const surface = pickToken(t, ["surface", "background", "canvas"]);
  const canvas = pickToken(t, ["canvas", "background", "surface"]);
  const chrome = pickToken(t, ["chrome", "surface", "background"]);
  const popover = pickToken(t, ["popover", "surface", "background"]);
  const raised = pickToken(t, ["raised", "secondary", "surface", "background"]);
  const hover = pickToken(t, ["hover", "raised", "selected", "surface"]);
  const selected = pickToken(t, ["selected", "selection", "raised", "surface"]);
  const border = pickToken(t, ["border", "input", "dim", "muted"]);
  const input = pickToken(t, ["input", "ring", "accent", "border"]);
  const foreground = pickToken(t, ["foreground", "surface_foreground", "primary_foreground"]);
  const muted = pickToken(t, ["muted", "muted_foreground", "secondary_foreground", "dim", "foreground"]);
  const dim = pickToken(t, ["dim", "unknown", "idle", "muted", "border"]);
  const accent = pickToken(t, ["accent", "primary", "ring", "working", "foreground"]);
  const accentForeground = pickToken(t, [
    "accent_foreground",
    "primary_foreground",
    "solid_foreground",
    "background",
    "foreground"
  ]);
  const solid = pickToken(t, ["solid", "primary", "accent", "foreground"]);
  const solidForeground = pickToken(t, [
    "solid_foreground",
    "primary_foreground",
    "accent_foreground",
    "background",
    "foreground"
  ]);
  const working = pickToken(t, ["working", "accent", "ansi3", "ansi4", "foreground"]);
  const blocked = pickToken(t, ["blocked", "ansi1", "destructive", "accent", "foreground"]);
  const done = pickToken(t, ["done", "ansi2", "accent", "foreground"]);
  const idle = pickToken(t, ["idle", "muted", "dim", "foreground"]);
  const unknown = pickToken(t, ["unknown", "dim", "muted", "foreground"]);

  return {
    background,
    surface,
    canvas,
    chrome,
    popover,
    raised,
    hover,
    selected,
    border,
    input,
    foreground,
    muted,
    dim,
    accent,
    accentForeground,
    solid,
    solidForeground,
    working,
    blocked,
    done,
    idle,
    unknown
  };
}

/**
 * Resolve priority foreground color for P0..P4 while preserving distinct levels
 * across light and dark Herdr themes.
 *
 * @param {number|string|null|undefined} priority
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function priorityColor(priority, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const level = normalizePriorityLevel(priority);
  const palette = resolvePriorityMap(t);
  return palette[level];
}

/**
 * Resolve priority badge tokens (text, background, border).
 *
 * @param {number|string|null|undefined} priority
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function priorityBadgeColors(priority, rawTheme = {}) {
  const tokens = resolveThemeTokens(rawTheme);
  const text = priorityColor(priority, rawTheme);
  return {
    text,
    bg: tokens.raised,
    border: text
  };
}

/**
 * Resolve filled pill colors for priority (P0..P4) with distinct border,
 * contrasting text, and state-appropriate surface fill.
 *
 * @param {number|string|null|undefined} priority
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function priorityPillColors(priority, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const level = normalizePriorityLevel(priority);
  const text = priorityColor(level, rawTheme);
  const surfaceOrder =
    level <= 1
      ? ["selected", "raised", "hover", "surface", "background"]
      : level <= 3
        ? ["raised", "selected", "hover", "surface", "background"]
        : ["canvas", "raised", "surface", "background"];

  return {
    bg: pickContrastingSurface(t, text, surfaceOrder),
    border: text,
    text
  };
}

const TYPE_CANDIDATES = Object.freeze({
  bug: ["ansi1", "blocked", "destructive", "accent", "foreground"],
  feature: ["accent", "ansi4", "done", "working", "foreground"],
  task: ["ansi6", "ansi4", "working", "accent", "done", "foreground"],
  epic: ["ansi5", "ansi13", "working", "accent", "solid", "foreground"],
  chore: ["ansi3", "idle", "muted", "ansi2", "dim", "foreground"]
});

function resolveTypeMap(themeMap) {
  const used = new Set();
  return {
    bug: pickDistinctToken(themeMap, TYPE_CANDIDATES.bug, used),
    feature: pickDistinctToken(themeMap, TYPE_CANDIDATES.feature, used),
    task: pickDistinctToken(themeMap, TYPE_CANDIDATES.task, used),
    epic: pickDistinctToken(themeMap, TYPE_CANDIDATES.epic, used),
    chore: pickDistinctToken(themeMap, TYPE_CANDIDATES.chore, used)
  };
}

/**
 * Resolve semantic foreground color for an issue type (bug, feature, task, epic, chore).
 *
 * @param {string|null|undefined} issueType
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function typeColor(issueType, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const key = normalizeTypeKey(issueType);
  const palette = resolveTypeMap(t);
  return palette[key];
}

/**
 * Resolve filled pill colors for an issue type (bug, feature, task, epic, chore).
 *
 * @param {string|null|undefined} issueType
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function typePillColors(issueType, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const key = normalizeTypeKey(issueType);
  const text = typeColor(issueType, rawTheme);
  const surfaceOrder =
    key === "bug" || key === "feature" || key === "epic"
      ? ["selected", "raised", "hover", "surface", "background"]
      : ["raised", "selected", "hover", "surface", "background"];

  return {
    bg: pickContrastingSurface(t, text, surfaceOrder),
    border: text,
    text
  };
}

const STATUS_CANDIDATES = Object.freeze({
  blocked: ["blocked", "ansi1", "destructive", "accent", "foreground"],
  working: ["working", "accent", "ansi3", "ansi4", "foreground"],
  done: ["done", "ansi2", "accent", "muted", "foreground"],
  open: ["muted", "idle", "secondary_foreground", "dim", "foreground"],
  deferred: ["dim", "unknown", "idle", "muted", "foreground"]
});

function resolveStatusMap(themeMap) {
  const used = new Set();
  return {
    blocked: pickDistinctToken(themeMap, STATUS_CANDIDATES.blocked, used),
    working: pickDistinctToken(themeMap, STATUS_CANDIDATES.working, used),
    done: pickDistinctToken(themeMap, STATUS_CANDIDATES.done, used),
    open: pickDistinctToken(themeMap, STATUS_CANDIDATES.open, used),
    deferred: pickDistinctToken(themeMap, STATUS_CANDIDATES.deferred, used)
  };
}

/**
 * Resolve semantic status foreground color across light and dark Herdr themes.
 *
 * @param {string|null|undefined} status
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function statusColor(status, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const normalized = normalizeStatusKey(status);
  const palette = resolveStatusMap(t);

  if (normalized === "in_progress" || normalized === "working" || normalized === "progress") {
    return palette.working;
  }
  if (normalized === "blocked") {
    return palette.blocked;
  }
  if (normalized === "closed" || normalized === "done" || normalized === "ready") {
    return palette.done;
  }
  if (normalized === "deferred") {
    return palette.deferred;
  }
  return palette.open;
}

/**
 * Resolve filled pill colors for an issue/dependency status.
 *
 * @param {string|null|undefined} status
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function statusPillColors(status, rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  const normalized = normalizeStatusKey(status);
  const text = statusColor(status, rawTheme);
  const isActiveState =
    normalized === "in_progress" ||
    normalized === "working" ||
    normalized === "progress" ||
    normalized === "blocked" ||
    normalized === "ready";
  const surfaceOrder = isActiveState
    ? ["selected", "raised", "hover", "surface", "background"]
    : normalized === "deferred"
      ? ["canvas", "raised", "surface", "background"]
      : ["raised", "selected", "hover", "surface", "background"];

  return {
    bg: pickContrastingSurface(t, text, surfaceOrder),
    border: text,
    text
  };
}

/**
 * Determine whether an issue status string represents a known status rather than
 * a missing or `"unknown"` placeholder.
 *
 * @param {unknown} status
 * @returns {boolean}
 */
export function isKnownStatus(status) {
  if (typeof status !== "string") return false;
  const cleaned = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return cleaned.length > 0 && cleaned !== "unknown";
}

/**
 * Resolve the border/accent color for an issue status, falling back to the
 * neutral theme border token when the status is missing or `"unknown"`.
 *
 * @param {unknown} status
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function statusBorderColor(status, rawTheme = {}) {
  const tokens = resolveThemeTokens(rawTheme);
  if (!isKnownStatus(status)) {
    return tokens.border;
  }
  return statusColor(status, rawTheme);
}

/**
 * Resolve interactive row/card colors for idle, keyboard-highlighted, and selected states,
 * including the issue-state left accent border (`stateBorder`) when `status` is known.
 *
 * @param {{selected?: boolean, highlighted?: boolean, status?: unknown}} [state]
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function rowColors(
  { selected = false, highlighted = false, status = null } = {},
  rawTheme = {}
) {
  const tokens = resolveThemeTokens(rawTheme);
  const hasStateBorder = isKnownStatus(status);
  const resolvedStateColor = hasStateBorder ? statusColor( /** @type {string} */ (status), rawTheme) : null;

  if (selected) {
    return {
      bg: tokens.selected,
      border: tokens.accent,
      stateBorder: resolvedStateColor ?? tokens.accent,
      hasStateBorder,
      hoverBg: tokens.selected,
      text: tokens.foreground,
      mutedText: tokens.muted,
      dimText: tokens.dim
    };
  }

  if (highlighted) {
    return {
      bg: tokens.raised,
      border: tokens.input,
      stateBorder: resolvedStateColor ?? tokens.input,
      hasStateBorder,
      hoverBg: tokens.hover,
      text: tokens.foreground,
      mutedText: tokens.muted,
      dimText: tokens.dim
    };
  }

  return {
    bg: tokens.surface,
    border: tokens.border,
    stateBorder: resolvedStateColor ?? tokens.border,
    hasStateBorder,
    hoverBg: tokens.hover,
    text: tokens.foreground,
    mutedText: tokens.muted,
    dimText: tokens.dim
  };
}

const SOLID_TEXT_CANDIDATE_KEYS = Object.freeze([
  "accent_foreground",
  "solid_foreground",
  "primary_foreground",
  "background",
  "foreground"
]);

const SOLID_SURFACE_CANDIDATE_KEYS = Object.freeze([
  "selected",
  "solid",
  "accent",
  "working",
  "input",
  "hover",
  "raised"
]);

/**
 * Parse a `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` color string into `{ r, g, b, a }`.
 *
 * @param {unknown} color
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
export function parseHexColor(color) {
  if (typeof color !== "string") return null;
  const trimmed = color.trim();
  if (!trimmed.startsWith("#")) return null;
  const rawHex = trimmed.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(rawHex)) return null;

  let hex = rawHex;
  let alpha = 1;
  if (rawHex.length === 3) {
    hex = rawHex[0] + rawHex[0] + rawHex[1] + rawHex[1] + rawHex[2] + rawHex[2];
  } else if (rawHex.length === 4) {
    hex = rawHex[0] + rawHex[0] + rawHex[1] + rawHex[1] + rawHex[2] + rawHex[2];
    alpha = parseInt(rawHex[3] + rawHex[3], 16) / 255;
  } else if (rawHex.length === 8) {
    hex = rawHex.slice(0, 6);
    alpha = parseInt(rawHex.slice(6, 8), 16) / 255;
  } else if (rawHex.length !== 6) {
    return null;
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: alpha
  };
}

function compositeColorOverBackdrop(fg, backdrop) {
  const alpha = typeof fg.a === "number" && Number.isFinite(fg.a) ? Math.max(0, Math.min(1, fg.a)) : 1;
  if (alpha >= 1) return fg;
  const bg = backdrop ?? { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1
  };
}

function channelToLinear(value) {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/**
 * Compute WCAG relative luminance (0..1) for a hex color string or `{ r, g, b, a? }` object.
 * Translucent colors (`a < 1`) are composited over `backdropColor` (default `#000000`).
 *
 * @param {unknown} color
 * @param {unknown} [backdropColor]
 * @returns {number|null}
 */
export function relativeLuminance(color, backdropColor = "#000000") {
  const parsed =
    color &&
    typeof color === "object" &&
    typeof color.r === "number" &&
    typeof color.g === "number" &&
    typeof color.b === "number"
      ? color
      : parseHexColor(color);
  if (!parsed) return null;

  const backdrop =
    backdropColor &&
    typeof backdropColor === "object" &&
    typeof backdropColor.r === "number" &&
    typeof backdropColor.g === "number" &&
    typeof backdropColor.b === "number"
      ? backdropColor
      : parseHexColor(backdropColor) ?? { r: 0, g: 0, b: 0, a: 1 };

  const rgb = compositeColorOverBackdrop(parsed, backdrop);
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute WCAG contrast ratio (1..21) between two colors, compositing translucent colors
 * over `backdropColor` (default `#000000`).
 *
 * @param {unknown} colorA
 * @param {unknown} colorB
 * @param {unknown} [backdropColor]
 * @returns {number|null}
 */
export function contrastRatio(colorA, colorB, backdropColor = "#000000") {
  const lumA = relativeLuminance(colorA, backdropColor);
  const lumB = relativeLuminance(colorB, backdropColor);
  if (lumA === null || lumB === null) return null;
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the candidate hex color with the highest WCAG contrast ratio against `bgHex`.
 *
 * @param {unknown} bgHex
 * @param {unknown[]} candidateHexes
 * @param {unknown} [backdropColor]
 * @returns {string|null}
 */
export function pickReadableColor(bgHex, candidateHexes, backdropColor = "#000000") {
  if (!parseHexColor(bgHex) || !Array.isArray(candidateHexes)) return null;
  let bestCandidate = null;
  let bestContrast = -1;

  for (const candidate of candidateHexes) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    const ratio = contrastRatio(bgHex, trimmed, backdropColor);
    if (ratio === null) continue;
    if (ratio > bestContrast) {
      bestContrast = ratio;
      bestCandidate = trimmed;
    }
  }

  return bestCandidate;
}

function formatOpaqueHex({ r, g, b }) {
  const toHex = (value) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Blend `baseColor` toward `targetColor` by `amount` (0..1) and return an opaque `#rrggbb`.
 * Translucent inputs are composited over the other color first, so the result never carries alpha.
 *
 * @param {unknown} baseColor
 * @param {unknown} targetColor
 * @param {number} [amount]
 * @returns {string|null}
 */
export function mixHexColors(baseColor, targetColor, amount = 0.5) {
  const base = parseHexColor(baseColor);
  const target = parseHexColor(targetColor);
  if (!base || !target) return null;

  const ratio = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0.5));
  const solidBase = compositeColorOverBackdrop(base, target);
  return formatOpaqueHex({
    r: solidBase.r + (target.r - solidBase.r) * ratio,
    g: solidBase.g + (target.g - solidBase.g) * ratio,
    b: solidBase.b + (target.b - solidBase.b) * ratio
  });
}

/**
 * Derive a hover/active shade of `baseColor` that keeps its hue and stays readable on `textColor`.
 *
 * The color is pushed away from the text's luminance first (lightened when the text is dark,
 * darkened when the text is light), because that direction only increases contrast. When the
 * primary direction cannot reach `minContrast` (for example a near-white base with dark text
 * that is already clamped), the opposite direction is tried. Returns `null` when no shade
 * reaches `minContrast`, so callers can fall back.
 *
 * @param {unknown} baseColor
 * @param {unknown} textColor
 * @param {{backdropColor?: unknown, minContrast?: number, preferredAmount?: number, maxAmount?: number, step?: number}} [options]
 * @returns {string|null}
 */
export function shiftForReadability(
  baseColor,
  textColor,
  {
    backdropColor = "#000000",
    minContrast = 4.5,
    preferredAmount = 0.12,
    maxAmount = 0.6,
    step = 0.04
  } = {}
) {
  if (!parseHexColor(baseColor) || !parseHexColor(textColor)) return null;

  const backdrop = parseHexColor(backdropColor) ?? { r: 0, g: 0, b: 0, a: 1 };
  const textLuminance = relativeLuminance(textColor, backdrop);
  const baseLuminance = relativeLuminance(baseColor, backdrop);
  if (textLuminance === null || baseLuminance === null) return null;

  const preferLighten = textLuminance <= baseLuminance;
  const targets = preferLighten ? ["#ffffff", "#000000"] : ["#000000", "#ffffff"];
  const start = Math.max(0.01, Math.min(1, preferredAmount));
  const cap = Math.max(start, Math.min(1, maxAmount));
  const stepSize = Math.max(0.01, step);

  for (const target of targets) {
    const amounts = [];
    for (let amount = start; amount <= cap + 1e-9; amount += stepSize) {
      amounts.push(amount);
    }
    amounts.push(cap);

    for (const amount of amounts) {
      const candidate = mixHexColors(baseColor, target, amount);
      if (!candidate || isSameColor(candidate, baseColor)) continue;
      const ratio = contrastRatio(candidate, textColor, backdrop);
      if (ratio !== null && ratio >= minContrast) return candidate;
    }
  }

  return null;
}

function isSameColor(colorA, colorB) {
  if (colorA === colorB) return true;
  const rgbA = parseHexColor(colorA);
  const rgbB = parseHexColor(colorB);
  if (rgbA && rgbB) {
    return (
      rgbA.r === rgbB.r &&
      rgbA.g === rgbB.g &&
      rgbA.b === rgbB.b &&
      Math.abs((rgbA.a ?? 1) - (rgbB.a ?? 1)) < 0.001
    );
  }
  return false;
}

function pickReadableSurfaceToken(
  themeMap,
  baseBg,
  textColor,
  {
    primaryMinContrast = 4.5,
    fallbackMinContrast = 3,
    backdropColor = "#000000",
    avoidColors = []
  } = {}
) {
  const allAvoid = [baseBg, ...avoidColors];
  const candidates = [];
  for (const key of SOLID_SURFACE_CANDIDATE_KEYS) {
    const token = readToken(themeMap, key);
    if (
      token !== null &&
      !allAvoid.some((avoid) => isSameColor(token, avoid)) &&
      !candidates.includes(token)
    ) {
      candidates.push(token);
    }
  }

  if (!parseHexColor(baseBg) || !parseHexColor(textColor)) {
    return candidates[0] ?? baseBg;
  }

  const opaqueCandidates = [];
  const alphaCandidates = [];
  for (const candidate of candidates) {
    const parsed = parseHexColor(candidate);
    if (!parsed) continue;
    if (parsed.a < 1) {
      alphaCandidates.push(candidate);
    } else {
      opaqueCandidates.push(candidate);
    }
  }

  // 1. Prefer opaque candidates that meet the primary contrast threshold
  for (const candidate of opaqueCandidates) {
    const ratio = contrastRatio(candidate, textColor, backdropColor);
    if (ratio !== null && ratio >= primaryMinContrast) {
      return candidate;
    }
  }

  // 2. Accept an alpha token only when its composited contrast still passes 4.5:1
  for (const candidate of alphaCandidates) {
    const ratio = contrastRatio(candidate, textColor, backdropColor);
    if (ratio !== null && ratio >= 4.5) {
      return candidate;
    }
  }

  // 3. Fallback to the highest-contrast opaque candidate that meets fallbackMinContrast (>= 3:1)
  let bestFallback = null;
  let bestFallbackRatio = -1;
  for (const candidate of opaqueCandidates) {
    const ratio = contrastRatio(candidate, textColor, backdropColor);
    if (ratio !== null && ratio >= fallbackMinContrast && ratio > bestFallbackRatio) {
      bestFallbackRatio = ratio;
      bestFallback = candidate;
    }
  }

  return bestFallback ?? null;
}

/**
 * Resolve interactive button/filter-chip colors for active, inactive, loading, and disabled states.
 *
 * @param {{active?: boolean, disabled?: boolean, loading?: boolean, mutedWhenInactive?: boolean, variant?: "ghost"|"solid"}} [state]
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function controlColors(
  {
    active = false,
    disabled = false,
    loading = false,
    mutedWhenInactive = false,
    variant = "ghost"
  } = {},
  rawTheme = {}
) {
  const t = normalizeThemeMap(rawTheme);
  const tokens = resolveThemeTokens(rawTheme);
  const isInactive = disabled || loading;

  if (variant === "solid") {
    if (isInactive) {
      const inactiveBg = loading ? tokens.raised : (tokens.surface ?? tokens.chrome);
      return {
        bg: inactiveBg,
        border: tokens.border,
        text: tokens.dim,
        hoverBg: inactiveBg
      };
    }

    if (mutedWhenInactive && !active) {
      const mutedBg = tokens.surface ?? tokens.chrome;
      return {
        bg: mutedBg,
        border: tokens.border,
        text: tokens.muted,
        hoverBg: tokens.hover
      };
    }

    const backdropColor = tokens.surface ?? tokens.background ?? "#000000";
    const restingBg = pickToken(t, ["accent", "solid", "primary", "ring", "working", "foreground"]);
    const textCandidates = SOLID_TEXT_CANDIDATE_KEYS.map((key) => readToken(t, key)).filter(
      (token) => token !== null
    );
    const preferredText = textCandidates[0] ?? null;
    const preferredTextContrast =
      preferredText && parseHexColor(restingBg)
        ? contrastRatio(restingBg, preferredText, backdropColor)
        : null;
    const solidText =
      preferredTextContrast !== null && preferredTextContrast >= 4.5
        ? preferredText
        : pickReadableColor(restingBg, textCandidates, backdropColor) ??
          pickToken(t, SOLID_TEXT_CANDIDATE_KEYS);

    const hasHexColors = Boolean(
      parseHexColor(restingBg) && parseHexColor(solidText) && parseHexColor(backdropColor)
    );

    // Hover and active are shades of the resting color, so the button keeps its hue instead of
    // jumping to an unrelated theme token (which turned an accent button near-white on hover).
    const deriveShade = (base, preferredAmount, avoidColors = []) => {
      if (!hasHexColors) return null;
      const candidate = shiftForReadability(base, solidText, {
        backdropColor,
        minContrast: 4.5,
        preferredAmount
      });
      if (!candidate) return null;
      if ([base, ...avoidColors].some((avoid) => isSameColor(candidate, avoid))) return null;
      return candidate;
    };

    if (!active) {
      const hoverBg =
        deriveShade(restingBg, 0.1) ??
        (hasHexColors
          ? pickReadableSurfaceToken(t, restingBg, solidText, {
              primaryMinContrast: 4.5,
              fallbackMinContrast: 3,
              backdropColor
            })
          : pickContrastingSurface(t, restingBg, ["solid", "working", "input", "hover", "raised"])) ??
        restingBg;

      return {
        bg: restingBg,
        border: restingBg,
        text: solidText,
        hoverBg
      };
    }

    const activeBg = mutedWhenInactive
      ? restingBg
      : deriveShade(restingBg, 0.22) ??
        (tokens.solid && tokens.solid !== restingBg ? tokens.solid : restingBg);

    const activeHoverBg =
      (activeBg === restingBg ? null : deriveShade(activeBg, 0.32, [restingBg])) ??
      deriveShade(restingBg, 0.32, [activeBg]) ??
      (hasHexColors ? activeBg : tokens.selected);

    return {
      bg: activeBg,
      border: activeBg,
      text: solidText,
      hoverBg: activeHoverBg
    };
  }

  const ghostBaseBg = tokens.surface ?? tokens.chrome;
  const bg = active ? tokens.selected : loading ? tokens.raised : ghostBaseBg;
  const border = active ? tokens.accent : tokens.border;
  const text = isInactive
    ? tokens.dim
    : active || !mutedWhenInactive
      ? tokens.foreground
      : tokens.muted;
  const hoverBg = active ? tokens.selected : isInactive ? bg : tokens.hover;

  return {
    bg,
    border,
    text,
    hoverBg
  };
}

/**
 * Resolve semantic error banner/message colors.
 *
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function errorColors(rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  return {
    bg: pickToken(t, ["surface", "raised", "background"]),
    border: pickToken(t, ["blocked", "ansi1", "destructive", "border"]),
    text: pickToken(t, ["blocked", "ansi1", "destructive", "foreground"])
  };
}

/**
 * Resolve semantic ready-badge colors.
 *
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function readyBadgeColors(rawTheme = {}) {
  const t = normalizeThemeMap(rawTheme);
  return {
    bg: pickToken(t, ["surface", "raised", "background"]),
    border: pickToken(t, ["done", "ansi2", "accent", "border"]),
    text: pickToken(t, ["done", "ansi2", "accent", "foreground"])
  };
}

/**
 * Resolve divider / split-handle colors for idle, hovered, and dragging states.
 *
 * @param {{active?: boolean, hovered?: boolean}} [state]
 * @param {Record<string, string>|{colors?: Record<string, string>}} [rawTheme]
 */
export function dividerColors({ active = false, hovered = false } = {}, rawTheme = {}) {
  const tokens = resolveThemeTokens(rawTheme);
  const color = active ? tokens.accent : hovered ? tokens.input : tokens.border;
  return {
    color,
    bg: active ? tokens.selected : hovered ? tokens.hover : tokens.surface
  };
}

/**
 * Determine whether a hex color string (`#rgb`, `#rrggbb`, `#rrggbbaa`) is dark.
 * Relative luminance > 0.5 is treated as light (`false`), otherwise dark (`true`).
 * Invalid inputs return `false`.
 *
 * @param {unknown} color
 * @returns {boolean}
 */
export function isDarkColor(color) {
  const luminance = relativeLuminance(color);
  if (luminance === null) return false;
  return luminance <= 0.5;
}
