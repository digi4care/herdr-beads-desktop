import {
  getProjectLayout,
  projectStateKey,
  readProjectState,
  resolveProjectDetailRatio,
  setProjectLayout,
  writeProjectState
} from "./project-state.js";

export const DEFAULT_DETAILS_RATIO = 0.38;
export const MIN_DETAILS_RATIO = 0.18;
export const MAX_DETAILS_RATIO = 0.72;
export const MIN_DETAILS_HEIGHT = 108;
export const MIN_LIST_HEIGHT = 140;
export const DEFAULT_DIVIDER_HEIGHT = 6;
export const DEFAULT_COLLAPSED_DETAILS_HEIGHT = 34;
export const DEFAULT_PANEL_HEIGHT = 600;
export const DETAILS_RATIO_STORAGE_KEY = "beads-desktop:details-height-ratio";

function clamp(value = 0, min = 0, max = 1) {
  if (min > max) return min;
  return Math.min(max, Math.max(min, value));
}

function roundRatio(value = 0) {
  return Math.round(value * 10000) / 10000;
}

function toFiniteNumber(value = null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOptions(firstArg = {}, secondArg = {}, thirdArg = {}) {
  if (firstArg && typeof firstArg === "object" && !Array.isArray(firstArg)) {
    return firstArg;
  }
  if (typeof firstArg === "number" || firstArg === null || firstArg === undefined) {
    if (typeof secondArg === "number") {
      return {
        ...thirdArg,
        panelHeight: firstArg,
        ratio: secondArg
      };
    }
    return {
      ...(secondArg && typeof secondArg === "object" ? secondArg : {}),
      panelHeight: firstArg
    };
  }
  return {};
}

export function normalizeDetailsRatio(value, fallback = DEFAULT_DETAILS_RATIO) {
  const rawFallback = toFiniteNumber(fallback);
  const safeFallback =
    rawFallback !== null && rawFallback > 0 && rawFallback < 1
      ? clamp(rawFallback, MIN_DETAILS_RATIO, MAX_DETAILS_RATIO)
      : DEFAULT_DETAILS_RATIO;

  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0 || parsed >= 1) {
    return roundRatio(safeFallback);
  }

  return roundRatio(clamp(parsed, MIN_DETAILS_RATIO, MAX_DETAILS_RATIO));
}

export const parseDetailsRatio = normalizeDetailsRatio;

export function getDetailsRatioBounds(firstArg = {}, secondArg = {}) {
  const options = normalizeOptions(firstArg, secondArg);
  const baseMin = clamp(toFiniteNumber(options.minRatio) ?? MIN_DETAILS_RATIO, 0.05, 0.95);
  const baseMax = clamp(toFiniteNumber(options.maxRatio) ?? MAX_DETAILS_RATIO, baseMin, 0.95);

  const safeMinDetails = Math.max(
    0,
    Math.round(toFiniteNumber(options.minDetailsHeight) ?? MIN_DETAILS_HEIGHT)
  );
  const safeMinList = Math.max(
    0,
    Math.round(toFiniteNumber(options.minListHeight) ?? MIN_LIST_HEIGHT)
  );
  const safeChrome = Math.max(0, Math.round(toFiniteNumber(options.chromeHeight) ?? 0));
  const safeDivider = Math.max(0, Math.round(toFiniteNumber(options.dividerHeight) ?? 0));

  const rawPanelHeight = toFiniteNumber(options.panelHeight);
  if (rawPanelHeight === null || rawPanelHeight <= 0) {
    return {
      minRatio: roundRatio(baseMin),
      maxRatio: roundRatio(baseMax),
      minDetailsHeight: safeMinDetails,
      maxDetailsHeight: null,
      availableHeight: null,
      chromeHeight: safeChrome,
      dividerHeight: safeDivider,
      isCompact: false
    };
  }

  const resolvedPanelHeight = Math.max(1, Math.round(rawPanelHeight));
  const reservedHeight = safeChrome + safeDivider;
  const availableHeight = Math.max(0, resolvedPanelHeight - reservedHeight);
  const totalMinRequired = safeMinDetails + safeMinList;

  if (availableHeight >= totalMinRequired) {
    const baseMinPx = Math.round(resolvedPanelHeight * baseMin);
    const baseMaxPx = Math.round(resolvedPanelHeight * baseMax);

    let minDetailsPx = Math.max(safeMinDetails, baseMinPx);
    let maxDetailsPx = Math.min(availableHeight - safeMinList, baseMaxPx);

    if (minDetailsPx > maxDetailsPx) {
      minDetailsPx = safeMinDetails;
      maxDetailsPx = availableHeight - safeMinList;
    }

    const effectiveMinRatio = minDetailsPx / resolvedPanelHeight;
    const effectiveMaxRatio = Math.max(effectiveMinRatio, maxDetailsPx / resolvedPanelHeight);

    return {
      minRatio: roundRatio(effectiveMinRatio),
      maxRatio: roundRatio(effectiveMaxRatio),
      minDetailsHeight: minDetailsPx,
      maxDetailsHeight: maxDetailsPx,
      availableHeight,
      chromeHeight: safeChrome,
      dividerHeight: safeDivider,
      isCompact: false
    };
  }

  if (availableHeight <= 0) {
    return {
      minRatio: 0,
      maxRatio: 0,
      minDetailsHeight: 0,
      maxDetailsHeight: 0,
      availableHeight: 0,
      chromeHeight: safeChrome,
      dividerHeight: safeDivider,
      isCompact: true
    };
  }

  const propShare = totalMinRequired > 0 ? safeMinDetails / totalMinRequired : 0.44;
  const minShare = Math.min(propShare, 0.35);
  const maxShare = Math.max(propShare, 0.55);

  const minDetailsPx =
    availableHeight >= 2 ? Math.max(1, Math.floor(availableHeight * minShare)) : availableHeight;
  const maxDetailsPx =
    availableHeight >= 2
      ? Math.min(availableHeight - 1, Math.max(minDetailsPx, Math.floor(availableHeight * maxShare)))
      : availableHeight;

  const effectiveMinRatio = minDetailsPx / resolvedPanelHeight;
  const effectiveMaxRatio = Math.max(effectiveMinRatio, maxDetailsPx / resolvedPanelHeight);

  return {
    minRatio: roundRatio(effectiveMinRatio),
    maxRatio: roundRatio(effectiveMaxRatio),
    minDetailsHeight: minDetailsPx,
    maxDetailsHeight: maxDetailsPx,
    availableHeight,
    chromeHeight: safeChrome,
    dividerHeight: safeDivider,
    isCompact: true
  };
}

export function clampDetailsRatio(ratioOrOptions = DEFAULT_DETAILS_RATIO, secondArg = {}, thirdArg = {}) {
  let rawRatio = ratioOrOptions;
  let options = secondArg;

  if (ratioOrOptions && typeof ratioOrOptions === "object" && !Array.isArray(ratioOrOptions)) {
    rawRatio = ratioOrOptions.ratio;
    options = ratioOrOptions;
  } else if (typeof secondArg === "number") {
    options = {
      ...(thirdArg && typeof thirdArg === "object" ? thirdArg : {}),
      panelHeight: secondArg
    };
  }

  const safeOptions = options && typeof options === "object" ? options : {};
  const bounds = getDetailsRatioBounds(safeOptions);
  const parsed = toFiniteNumber(rawRatio);
  const target =
    parsed !== null
      ? parsed
      : normalizeDetailsRatio(safeOptions.fallbackRatio, DEFAULT_DETAILS_RATIO);

  return roundRatio(clamp(target, bounds.minRatio, bounds.maxRatio));
}

export function serializeDetailsRatio(ratio = DEFAULT_DETAILS_RATIO, options = {}) {
  const clamped = clampDetailsRatio(ratio, options);
  return String(roundRatio(clamped));
}

export function computeDetailsLayout(firstArg = {}, secondArg = {}, thirdArg = {}) {
  const options = normalizeOptions(firstArg, secondArg, thirdArg);
  const fallbackPanelHeight = Math.max(
    1,
    Math.round(toFiniteNumber(options.fallbackPanelHeight) ?? DEFAULT_PANEL_HEIGHT)
  );
  const rawPanelHeight = toFiniteNumber(options.panelHeight);
  const effectivePanelHeight =
    rawPanelHeight !== null && rawPanelHeight > 0
      ? Math.max(1, Math.round(rawPanelHeight))
      : fallbackPanelHeight;

  const preferredRatio = normalizeDetailsRatio(
    options.ratio,
    options.fallbackRatio ?? DEFAULT_DETAILS_RATIO
  );
  const bounds = getDetailsRatioBounds({
    ...options,
    panelHeight: effectivePanelHeight
  });
  const clampedRatio = clampDetailsRatio(preferredRatio, {
    ...options,
    panelHeight: effectivePanelHeight
  });

  const rawDetailsPx = Math.round(effectivePanelHeight * clampedRatio);
  const expandedDetailsHeight = clamp(rawDetailsPx, bounds.minDetailsHeight, bounds.maxDetailsHeight);
  const collapsed = options.collapsed === true || options.detailsCollapsed === true;
  const rawCollapsedHeight = toFiniteNumber(options.collapsedHeight);
  const collapsedDetailsHeight = Math.min(
    bounds.availableHeight,
    Math.max(0, Math.round(rawCollapsedHeight ?? DEFAULT_COLLAPSED_DETAILS_HEIGHT))
  );
  const detailsHeight = collapsed ? collapsedDetailsHeight : expandedDetailsHeight;
  const listHeight = Math.max(0, bounds.availableHeight - detailsHeight);
  const effectiveRatio =
    effectivePanelHeight > 0 ? roundRatio(expandedDetailsHeight / effectivePanelHeight) : clampedRatio;

  return {
    panelHeight: effectivePanelHeight,
    availableHeight: bounds.availableHeight,
    detailsHeight,
    listHeight,
    chromeHeight: bounds.chromeHeight,
    dividerHeight: bounds.dividerHeight,
    ratio: preferredRatio,
    effectiveRatio,
    minRatio: bounds.minRatio,
    maxRatio: bounds.maxRatio,
    minDetailsHeight: bounds.minDetailsHeight,
    maxDetailsHeight: bounds.maxDetailsHeight,
    isCompact: bounds.isCompact,
    collapsed
  };
}

export function computeDetailsHeight(firstArg = {}, secondArg = {}, thirdArg = {}) {
  return computeDetailsLayout(firstArg, secondArg, thirdArg).detailsHeight;
}

export function dragDeltaToDetailsRatio(firstArg = {}, secondArg = {}, thirdArg = {}, fourthArg = {}) {
  let options = firstArg;
  if (typeof firstArg === "number") {
    options = {
      ...(fourthArg && typeof fourthArg === "object" ? fourthArg : {}),
      deltaY: firstArg,
      panelHeight: secondArg,
      startRatio: thirdArg
    };
  }

  const safeOptions = options && typeof options === "object" ? options : {};
  const panelHeight = toFiniteNumber(safeOptions.panelHeight);
  const deltaY = toFiniteNumber(safeOptions.deltaY);

  if (panelHeight === null || panelHeight <= 0 || deltaY === null) {
    return clampDetailsRatio(
      safeOptions.startRatio ?? safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO,
      safeOptions
    );
  }

  const startDetailsHeight = toFiniteNumber(safeOptions.startDetailsHeight);
  const baseStartHeight =
    startDetailsHeight !== null && startDetailsHeight >= 0
      ? startDetailsHeight
      : clampDetailsRatio(
          safeOptions.startRatio ?? safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO,
          { ...safeOptions, panelHeight }
        ) * panelHeight;

  const nextDetailsHeight = baseStartHeight - deltaY;
  const rawRatio = nextDetailsHeight / panelHeight;
  return clampDetailsRatio(rawRatio, { ...safeOptions, panelHeight });
}

export function pointerToDetailsRatio(firstArg = {}, secondArg = {}, thirdArg = {}) {
  let options = firstArg;
  if (typeof firstArg === "number") {
    options = {
      ...(thirdArg && typeof thirdArg === "object" ? thirdArg : {}),
      pointerY: firstArg,
      panelHeight: secondArg
    };
  }

  const safeOptions = options && typeof options === "object" ? options : {};
  const pointerY = toFiniteNumber(safeOptions.pointerY);
  const panelHeight = toFiniteNumber(safeOptions.panelHeight);

  if (pointerY === null || panelHeight === null || panelHeight <= 0) {
    return clampDetailsRatio(
      safeOptions.startRatio ?? safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO,
      safeOptions
    );
  }

  const startY = toFiniteNumber(safeOptions.startY);
  const hasStartAnchor =
    startY !== null &&
    (toFiniteNumber(safeOptions.startRatio) !== null ||
      toFiniteNumber(safeOptions.startDetailsHeight) !== null);

  if (hasStartAnchor) {
    return dragDeltaToDetailsRatio({
      ...safeOptions,
      panelHeight,
      deltaY: pointerY - startY
    });
  }

  const panelTop = toFiniteNumber(safeOptions.panelTop) ?? 0;
  const dividerOffset = toFiniteNumber(safeOptions.dividerOffset) ?? 0;
  const panelBottom = panelTop + panelHeight;
  const rawDetailsHeight = panelBottom - (pointerY - dividerOffset);
  const rawRatio = rawDetailsHeight / panelHeight;

  return clampDetailsRatio(rawRatio, { ...safeOptions, panelHeight });
}

export function resolveDividerDrag(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const collapsed = safeOptions.collapsed === true || safeOptions.detailsCollapsed === true;
  if (collapsed) {
    const preservedRatio = normalizeDetailsRatio(
      safeOptions.currentRatio ?? safeOptions.startRatio,
      safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO
    );
    const layout = computeDetailsLayout({
      ...safeOptions,
      ratio: preservedRatio,
      collapsed: true
    });
    return {
      ...layout,
      ratio: preservedRatio,
      changed: false
    };
  }

  const nextRatio = pointerToDetailsRatio(safeOptions);
  const layout = computeDetailsLayout({
    ...safeOptions,
    ratio: nextRatio
  });
  const currentRatio = toFiniteNumber(safeOptions.currentRatio);
  const changed = currentRatio === null ? true : Math.abs(nextRatio - currentRatio) > 0.0001;

  return {
    ...layout,
    ratio: nextRatio,
    changed
  };
}

export function sizesToDetailsRatio(sizes = [], options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  if (!Array.isArray(sizes) || sizes.length < 2) {
    return clampDetailsRatio(
      safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO,
      safeOptions
    );
  }

  const listHeight = Math.max(0, toFiniteNumber(sizes[0]) ?? 0);
  const detailsHeight = Math.max(0, toFiniteNumber(sizes[1]) ?? 0);
  const explicitPanelHeight = toFiniteNumber(safeOptions.panelHeight);
  const totalHeight =
    explicitPanelHeight !== null && explicitPanelHeight > 0
      ? explicitPanelHeight
      : listHeight + detailsHeight;

  if (totalHeight <= 0) {
    return clampDetailsRatio(
      safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO,
      safeOptions
    );
  }

  return clampDetailsRatio(detailsHeight / totalHeight, {
    ...safeOptions,
    panelHeight: totalHeight
  });
}

function resolveStorage(explicitStorage = undefined) {
  if (explicitStorage !== undefined) {
    return explicitStorage;
  }
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

function readFromStore(store = null, key = DETAILS_RATIO_STORAGE_KEY) {
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

function writeToStore(store = null, key = DETAILS_RATIO_STORAGE_KEY, serialized = "") {
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

export function loadDetailsRatio(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const key =
    typeof safeOptions.key === "string" && safeOptions.key
      ? safeOptions.key
      : DETAILS_RATIO_STORAGE_KEY;
  const fallbackRatio = safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO;
  const primary = resolveStorage(safeOptions.storage);
  const primaryRes = readFromStore(primary, key);

  if (primaryRes.ok && primaryRes.value !== null && primaryRes.value !== undefined) {
    return normalizeDetailsRatio(primaryRes.value, fallbackRatio);
  }

  if (safeOptions.fallbackStorage) {
    const fallbackRes = readFromStore(safeOptions.fallbackStorage, key);
    if (fallbackRes.ok && fallbackRes.value !== null && fallbackRes.value !== undefined) {
      return normalizeDetailsRatio(fallbackRes.value, fallbackRatio);
    }
  }

  return normalizeDetailsRatio(null, fallbackRatio);
}

export function saveDetailsRatio(ratio = DEFAULT_DETAILS_RATIO, options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const key =
    typeof safeOptions.key === "string" && safeOptions.key
      ? safeOptions.key
      : DETAILS_RATIO_STORAGE_KEY;
  const fallbackRatio = safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO;
  const rawPanelHeight = toFiniteNumber(safeOptions.panelHeight);
  const hasPanelHeight = rawPanelHeight !== null && rawPanelHeight > 0;

  const resolvedRatio = hasPanelHeight
    ? clampDetailsRatio(ratio, safeOptions)
    : normalizeDetailsRatio(ratio, fallbackRatio);
  const serialized = serializeDetailsRatio(resolvedRatio, safeOptions);
  const primary = resolveStorage(safeOptions.storage);

  let persisted = writeToStore(primary, key, serialized);
  if (!persisted && safeOptions.fallbackStorage) {
    persisted = writeToStore(safeOptions.fallbackStorage, key, serialized);
  }

  return {
    ratio: resolvedRatio,
    serialized,
    persisted
  };
}

export function computePopupLayout(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const mode = safeOptions.mode === "board" ? "board" : "detail";
  const rawViewportWidth = toFiniteNumber(safeOptions.viewportWidth);
  const rawViewportHeight = toFiniteNumber(safeOptions.viewportHeight);
  const viewportWidth =
    rawViewportWidth !== null && rawViewportWidth > 0 ? Math.round(rawViewportWidth) : 1280;
  const viewportHeight =
    rawViewportHeight !== null && rawViewportHeight > 0 ? Math.round(rawViewportHeight) : 800;

  const margin = Math.max(12, Math.round(toFiniteNumber(safeOptions.margin) ?? 24));
  const maxAvailableWidth = Math.max(240, viewportWidth - margin * 2);
  const maxAvailableHeight = Math.max(200, viewportHeight - margin * 2);

  const targetWidthShare = mode === "board" ? 0.78 : 0.64;
  const targetHeightShare = mode === "board" ? 0.82 : 0.74;
  const minPreferredWidth = mode === "board" ? 520 : 420;
  const maxPreferredWidth = mode === "board" ? 1080 : 860;
  const minPreferredHeight = mode === "board" ? 380 : 300;
  const maxPreferredHeight = mode === "board" ? 860 : 720;

  const minWidth = Math.min(minPreferredWidth, maxAvailableWidth);
  const maxWidth = Math.min(maxPreferredWidth, maxAvailableWidth);
  const minHeight = Math.min(minPreferredHeight, maxAvailableHeight);
  const maxHeight = Math.min(maxPreferredHeight, maxAvailableHeight);

  const width = clamp(Math.round(viewportWidth * targetWidthShare), minWidth, maxWidth);
  const height = clamp(Math.round(viewportHeight * targetHeightShare), minHeight, maxHeight);

  const headerChromeHeight = Math.max(
    0,
    Math.round(toFiniteNumber(safeOptions.chromeHeight) ?? (mode === "board" ? 96 : 52))
  );
  const bodyHeight = Math.max(80, height - headerChromeHeight);

  const detailsLayout =
    mode === "board"
      ? computeDetailsLayout({
          panelHeight: height,
          ratio: safeOptions.detailsRatio ?? safeOptions.ratio ?? DEFAULT_DETAILS_RATIO,
          collapsed: safeOptions.detailsCollapsed === true || safeOptions.collapsed === true,
          chromeHeight: headerChromeHeight,
          dividerHeight: safeOptions.dividerHeight ?? DEFAULT_DIVIDER_HEIGHT,
          minDetailsHeight: safeOptions.minDetailsHeight ?? MIN_DETAILS_HEIGHT,
          minListHeight: safeOptions.minListHeight ?? MIN_LIST_HEIGHT
        })
      : null;

  return {
    mode,
    viewportWidth,
    viewportHeight,
    width,
    height,
    widthShare: roundRatio(width / viewportWidth),
    heightShare: roundRatio(height / viewportHeight),
    bodyHeight,
    detailsLayout
  };
}

export function projectKeyForContext(context = null) {
  if (!context || typeof context !== "object") {
    return projectStateKey();
  }
  return projectStateKey({
    machine: context.machine,
    workspace: context.workspace ?? context.spaceId,
    cwd: context.cwd
  });
}

function readProjectStateWithFallback({ storage, fallbackStorage } = {}) {
  const primary = resolveStorage(storage);
  const primaryState = readProjectState(primary);
  if (Object.keys(primaryState).length > 0 || !fallbackStorage) {
    return primaryState;
  }
  return readProjectState(fallbackStorage);
}

export function loadProjectDetailsLayout(options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const projectKey =
    typeof safeOptions.projectKey === "string" && safeOptions.projectKey
      ? safeOptions.projectKey
      : projectKeyForContext(safeOptions.context);
  const state = readProjectStateWithFallback(safeOptions);
  const legacyRatio = loadDetailsRatio({
    storage: safeOptions.storage,
    fallbackStorage: safeOptions.fallbackStorage,
    fallbackRatio: safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO
  });
  const layout = getProjectLayout(state, projectKey);
  const detailRatio = resolveProjectDetailRatio({
    state,
    projectKey,
    legacyRatio
  });

  return {
    projectKey,
    detailRatio,
    detailsCollapsed: Boolean(layout.detailsCollapsed),
    hasStoredRatio: typeof layout.detailRatio === "number",
    state
  };
}

export function saveProjectDetailsLayout(patch = {}, options = {}) {
  const safePatch = patch && typeof patch === "object" ? patch : {};
  const safeOptions = options && typeof options === "object" ? options : {};
  const projectKey =
    typeof safeOptions.projectKey === "string" && safeOptions.projectKey
      ? safeOptions.projectKey
      : projectKeyForContext(safeOptions.context);
  const fallbackRatio = safeOptions.fallbackRatio ?? DEFAULT_DETAILS_RATIO;
  const rawPanelHeight = toFiniteNumber(safeOptions.panelHeight);
  const hasPanelHeight = rawPanelHeight !== null && rawPanelHeight > 0;

  const normalizedPatch = {};
  if (safePatch.detailRatio !== undefined && safePatch.detailRatio !== null) {
    normalizedPatch.detailRatio = hasPanelHeight
      ? clampDetailsRatio(safePatch.detailRatio, safeOptions)
      : normalizeDetailsRatio(safePatch.detailRatio, fallbackRatio);
  }
  if (typeof safePatch.detailsCollapsed === "boolean") {
    normalizedPatch.detailsCollapsed = safePatch.detailsCollapsed;
  }

  const currentState = readProjectStateWithFallback(safeOptions);
  const nextState = setProjectLayout(currentState, projectKey, normalizedPatch);
  const primary = resolveStorage(safeOptions.storage);

  let persisted = writeProjectState(primary, nextState);
  if (!persisted && safeOptions.fallbackStorage) {
    persisted = writeProjectState(safeOptions.fallbackStorage, nextState);
  }

  const legacyRatio = loadDetailsRatio({
    storage: safeOptions.storage,
    fallbackStorage: safeOptions.fallbackStorage,
    fallbackRatio
  });
  const layout = getProjectLayout(nextState, projectKey);
  const detailRatio = resolveProjectDetailRatio({
    state: nextState,
    projectKey,
    legacyRatio
  });

  return {
    projectKey,
    detailRatio,
    detailsCollapsed: Boolean(layout.detailsCollapsed),
    persisted,
    state: nextState
  };
}
