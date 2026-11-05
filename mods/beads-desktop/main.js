import * as fs from "fs/promises";
import { View, div, image, svg } from "gpui-kit";
import { Popup, TextView, h_flex, v_flex } from "gpui-base";
import {
  appHome,
  closeOverlay,
  exec,
  focused,
  layout,
  nextCommand,
  openOverlay,
  props,
  readTextFile,
  run,
  setShared,
  shared,
  spaces,
  theme,
  writeTextFile
} from "herdr";
import { filterIssues } from "./data.js";
import { buildExecOptions, createCliRunner } from "./cli.js";
import { resolveProjectContext, resolveVisibilityAction } from "./context.js";
import {
  DEFAULT_DETAILS_RATIO,
  DEFAULT_DIVIDER_HEIGHT,
  DEFAULT_PANEL_HEIGHT,
  computeDetailsLayout,
  computePopupLayout,
  loadProjectDetailsLayout,
  projectKeyForContext,
  resolveDividerDrag,
  saveProjectDetailsLayout
} from "./details-layout.js";
import {
  PROJECT_STATE_STORAGE_KEY,
  getProjectLayout,
  projectStateKey,
  readProjectState,
  resolveProjectDetailRatio,
  setProjectLayout,
  writeProjectState
} from "./project-state.js";
import {
  computeSvgDisplaySize,
  hashString,
  hasMermaidBlocks,
  mermaidCacheKey,
  mermaidSvgUrl,
  parseSvgViewBox,
  splitMermaidBlocks
} from "./markdown.js";
import {
  isStaleSelectionRequest,
  resolveHighlightId,
  resolveSelection,
  shouldLoadDetails
} from "./selection.js";
import {
  DEFAULT_SETTINGS,
  FONT_SCALES,
  SETTINGS_SHARED_KEY,
  mergeSettings,
  parseSettings,
  serializeSettings,
  scaleFont,
  settingsEqual
} from "./settings.js";
import {
  controlColors,
  dividerColors,
  errorColors,
  isDarkColor,
  priorityBadgeColors,
  priorityColor,
  priorityPillColors,
  readyBadgeColors,
  resolveThemeTokens,
  rowColors,
  statusColor,
  statusPillColors,
  typePillColors
} from "./theme.js";

const SHARED_CONTEXT_KEY = "beads-desktop:active-context";
const SHARED_SELECTION_KEY = "beads-desktop:selected-issue";
const POPUP_OVERLAY_KEY = "beads-desktop-popup";
const MOD_CACHE_DIR = "mods/beads-desktop/.mermaid";

function formatMermaidErrorReason(err) {
  const raw = typeof err === "string" ? err : err?.message || "";
  if (/cache folder unavailable/i.test(raw)) {
    return "Cache folder unavailable";
  }
  const httpMatch = /^HTTP\s+(\d{3})/i.exec(raw.trim());
  if (httpMatch) {
    return `Render service returned HTTP ${httpMatch[1]}`;
  }
  if (/unexpected response/i.test(raw)) {
    return "Unexpected response";
  }
  if (/write|cache|enoent|eacces|eperm|directory|file/i.test(raw)) {
    return "Cache folder unavailable";
  }
  return "Network unavailable";
}

const herdrSharedStorage = {
  get(key) {
    return shared(key);
  },
  set(key, value) {
    setShared(key, value);
  }
};

function getFallbackLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

function resolveInstanceProps(initialProps = null) {
  let hostProps = null;
  try {
    hostProps = props();
  } catch {
    hostProps = null;
  }
  return {
    ...(initialProps && typeof initialProps === "object" ? initialProps : {}),
    ...(hostProps && typeof hostProps === "object" ? hostProps : {})
  };
}

function readSharedContext() {
  try {
    const raw = shared(SHARED_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      return parsed;
    }
  } catch {
    // Ignore invalid shared context payload
  }
  return null;
}

function writeSharedContext(context) {
  if (!context || typeof context !== "object" || !context.supported || !context.cwd) return;
  try {
    const payload = JSON.stringify({
      key: context.key,
      supported: Boolean(context.supported),
      cwd: context.cwd,
      tabId: context.tabId ?? null,
      spaceId: context.spaceId ?? null,
      spaceName: context.spaceName || context.cwd,
      reason: context.reason ?? null,
      machine: context.machine ?? null
    });
    if (shared(SHARED_CONTEXT_KEY) !== payload) {
      setShared(SHARED_CONTEXT_KEY, payload);
    }
  } catch {
    // Ignore shared write errors
  }
}

function readSharedSelection(contextKey = null) {
  try {
    const raw = shared(SHARED_SELECTION_KEY);
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    if (contextKey && parsed.contextKey && parsed.contextKey !== contextKey) {
      return null;
    }
    return {
      contextKey: typeof parsed.contextKey === "string" ? parsed.contextKey : null,
      selectedId: typeof parsed.selectedId === "string" && parsed.selectedId ? parsed.selectedId : null,
      highlightedId:
        typeof parsed.highlightedId === "string" && parsed.highlightedId ? parsed.highlightedId : null,
      filter: parsed.filter === "ready" ? "ready" : "active"
    };
  } catch {
    return null;
  }
}

function writeSharedSelection({ contextKey, selectedId, highlightedId, filter }) {
  if (!contextKey) return;
  try {
    const payload = JSON.stringify({
      contextKey,
      selectedId: selectedId ?? null,
      highlightedId: highlightedId ?? selectedId ?? null,
      filter: filter === "ready" ? "ready" : "active"
    });
    if (shared(SHARED_SELECTION_KEY) !== payload) {
      setShared(SHARED_SELECTION_KEY, payload);
    }
  } catch {
    // Ignore shared write errors
  }
}

function measureViewportSize(panelWidth = 380, panelHeight = DEFAULT_PANEL_HEIGHT) {
  try {
    if (typeof window !== "undefined" && typeof window.viewport_size === "function") {
      const size = window.viewport_size();
      if (
        size &&
        typeof size.width === "number" &&
        Number.isFinite(size.width) &&
        size.width > 0 &&
        typeof size.height === "number" &&
        Number.isFinite(size.height) &&
        size.height > 0
      ) {
        return {
          width: Math.round(size.width),
          height: Math.round(size.height)
        };
      }
    }
  } catch {
    // Fall back to panel-derived dimensions when window.viewport_size is unavailable
  }
  return {
    width: Math.max(720, Math.round((panelWidth || 380) * 2.4)),
    height: Math.max(480, Math.round(panelHeight || DEFAULT_PANEL_HEIGHT))
  };
}

function getActiveContext(previousContext = null) {
  const fallbackContext = previousContext ?? readSharedContext();
  return resolveProjectContext({ focused: focused(), spaces: spaces() }, fallbackContext);
}

function boundMessage(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || /^[\s{}[\],:;"']+$/.test(cleaned) || cleaned === "[object Object]") {
    return null;
  }
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}…` : cleaned;
}

function extractStructuredMessage(value) {
  if (!value || typeof value !== "object") return null;
  const nestedErrorMessage = boundMessage(value.error?.message);
  if (nestedErrorMessage) return nestedErrorMessage;
  const directError = boundMessage(value.error);
  if (directError) return directError;
  return null;
}

function parseEmbeddedJsonMessage(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return (
      extractStructuredMessage(parsed) ??
      boundMessage(parsed?.message)
    );
  } catch {
    return null;
  }
}

function formatError(err, fallback) {
  if (!err) return fallback;
  if (typeof err === "object") {
    const structured = extractStructuredMessage(err) ?? parseEmbeddedJsonMessage(err.message);
    if (structured) return structured;
    const directMessage = boundMessage(err.message);
    if (directMessage) return directMessage;
  }
  const raw = typeof err === "string" ? err : String(err);
  const fromJson = parseEmbeddedJsonMessage(raw);
  if (fromJson) return fromJson;
  const meaningfulLine = raw
    .split("\n")
    .map((line) => boundMessage(line))
    .find(Boolean);
  return meaningfulLine ?? boundMessage(raw) ?? fallback;
}

function isExecRejectionError(err) {
  if (!err || typeof err !== "object") return false;
  if (err.code === "ENOENT" || err.code === "EPERM") return true;
  return /program not found|cannot start|no such file or directory|not found/i.test(
    String(err.message || "")
  );
}

function isNotInitializedError(err) {
  if (!err || typeof err !== "object") return false;
  if (err.code === "NOT_INITIALIZED" || err.error?.code === "NOT_INITIALIZED") return true;
  const raw = typeof err === "string" ? err : err.message || String(err);
  return /NOT_INITIALIZED|Beads not initialized/i.test(raw);
}

export default class BeadsDesktop extends View {
  syncOverlayProps() {
    const instanceProps = resolveInstanceProps(this.initialProps);
    const nextOverlayId =
      typeof instanceProps.overlay === "string" && instanceProps.overlay
        ? instanceProps.overlay
        : this.overlayId ?? null;
    const explicitMode =
      instanceProps.mode === "detail"
        ? "detail"
        : instanceProps.mode === "board"
          ? "board"
          : this.popupMode;
    this.overlayId = nextOverlayId;
    this.popupMode =
      explicitMode === "detail"
        ? "detail"
        : explicitMode === "board" || Boolean(nextOverlayId)
          ? "board"
          : null;
    this.isOverlay = Boolean(this.overlayId || this.popupMode);
    if (this.isOverlay && this.contextMenu) {
      this.contextMenu = null;
    }
    return instanceProps;
  }

  canOpenDetailPopup(context = this.currentContext) {
    this.syncOverlayProps();
    if (this.isOverlay || this.popupMode !== null) {
      return false;
    }
    return Boolean(context?.supported && context?.cwd);
  }

  canOpenBoardPopup(context = this.currentContext) {
    this.syncOverlayProps();
    if (this.isOverlay && this.popupMode !== "detail") {
      return false;
    }
    return Boolean(context?.supported && context?.cwd);
  }

  init(initialProps, cx) {
    this.initialProps =
      initialProps && typeof initialProps === "object" ? initialProps : null;
    this.overlayId = null;
    this.popupMode = null;
    this.isOverlay = false;
    const instanceProps = this.syncOverlayProps();
    this.initialPopupIssueId =
      typeof instanceProps.issueId === "string" && instanceProps.issueId
        ? instanceProps.issueId
        : null;
    this.initialPopupFilter =
      instanceProps.filter === "ready"
        ? "ready"
        : instanceProps.filter === "active"
          ? "active"
          : null;
    this.initialPopupContext =
      instanceProps.context && typeof instanceProps.context === "object"
        ? instanceProps.context
        : null;

    this.cli = createCliRunner({ exec });
    this.handle = cx.focus_handle();
    this.contextKey = null;
    this.projectGen = 0;
    this.detailGen = 0;
    this.bvGen = 0;

    this.filter = this.initialPopupFilter ?? "active";
    this.listState = "idle";
    this.listError = null;
    this.issues = [];
    this.readyIds = new Set();
    this.totalIssues = 0;
    this.hasMoreIssues = false;

    this.highlightedId = this.initialPopupIssueId ?? null;
    this.selectedId = this.initialPopupIssueId ?? null;
    this.loadingDetailId = null;
    this.detailState = "idle";
    this.detailError = null;
    this.selectedIssue = null;
    this.selectedDeps = [];
    this.contextMenu = null;

    this.bvAvailable = false;
    this.bvMode = null;
    this.bvState = "idle";
    this.bvError = null;
    this.bvNext = null;
    this.bvTriage = [];
    this.closed = false;

    this.blockId = null;
    this.hiddenByMod = false;
    this.probeState = "idle";
    this.lastProbeTime = 0;
    this.visibilityTimer = null;
    this.currentContext = this.initialPopupContext ?? readSharedContext();
    this.appSettings = parseSettings(shared(SETTINGS_SHARED_KEY));
    this.showSettings = false;
    this.mermaidStates = new Map();
    this.mermaidCacheDirReady = false;

    const initialContext = getActiveContext(this.currentContext ?? null);
    const initialProjectLayout = loadProjectDetailsLayout({
      context: initialContext,
      storage: herdrSharedStorage,
      fallbackStorage: getFallbackLocalStorage(),
      fallbackRatio: DEFAULT_DETAILS_RATIO
    });
    this.projectKey = initialProjectLayout.projectKey;
    this.detailsRatio = initialProjectLayout.detailRatio;
    this.detailsCollapsed = initialProjectLayout.detailsCollapsed;

    if (this.isOverlay) {
      const viewport = measureViewportSize(380, DEFAULT_PANEL_HEIGHT);
      const initialPopupLayout = computePopupLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        mode: this.popupMode ?? "detail",
        detailsRatio: this.detailsRatio,
        detailsCollapsed: this.detailsCollapsed
      });
      this.panelWidth =
        typeof instanceProps.popupWidth === "number" && instanceProps.popupWidth > 0
          ? Math.round(instanceProps.popupWidth)
          : initialPopupLayout.width;
      this.panelHeight =
        typeof instanceProps.popupHeight === "number" && instanceProps.popupHeight > 0
          ? Math.round(instanceProps.popupHeight)
          : initialPopupLayout.height;
    } else {
      this.panelHeight = DEFAULT_PANEL_HEIGHT;
      this.panelWidth = 380;
    }

    this.dividerHovered = false;
    this.dividerDragging = false;
    this.dividerDragStart = null;

    cx.spawn(async (asyncCx) => {
      try {
        while (!this.closed) {
          const command = await nextCommand();
          if (this.closed) break;
          if (command === "focus") {
            this.handle.focus();
            this.syncFromSharedState(asyncCx);
            asyncCx.notify();
          }
        }
      } catch {
        // Loop terminates when mod reloads or closes.
      }
    });

    this.syncContext(cx);

    this.visibilityTimer = cx.timer.every(1000, (asyncCx) => {
      if (this.closed) return;
      const context = getActiveContext(this.currentContext ?? null);
      if (context.key !== this.contextKey) {
        this.syncContext(asyncCx);
        return;
      }

      this.syncFromSharedState(asyncCx);

      if (this.isOverlay || !this.hiddenByMod) {
        this.lastProbeTime = 0;
        this.probeState = "idle";
        return;
      }

      if (this.probeState === "loading") return;

      if (!context.supported || !context.cwd) {
        this.lastProbeTime = 0;
        this.probeState = "idle";
        return;
      }

      const now = Date.now();
      if (now - this.lastProbeTime < 5000) return;
      this.lastProbeTime = now;
      this.probeState = "loading";

      asyncCx.spawn(async (probeCx) => {
        try {
          const probeRes = await exec("br", ["list", "--json", "--limit", "1"], buildExecOptions(context));
          if (this.closed) return;
          const available = probeRes.code === 0;
          this.probeState = available ? "ready" : "error";
          if (available) {
            this.probeState = "ready";
            this.refreshIssues(probeCx, context, false);
          }
        } catch {
          if (!this.closed) this.probeState = "error";
        }
      });
    });
  }

  async close() {
    this.closed = true;
    this.contextMenu = null;
    this.dividerDragging = false;
    this.dividerDragStart = null;
    this.visibilityTimer?.cancel();
    this.visibilityTimer = null;
    this.projectGen += 1;
    this.detailGen += 1;
    this.bvGen += 1;
  }

  findOwnLayoutBlock(node) {
    if (!node || typeof node !== "object") return null;
    if (node.content?.mod === "beads-desktop" && typeof node.id === "string" && node.id) {
      return { id: node.id, hidden: node.hidden === true };
    }
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = this.findOwnLayoutBlock(child);
        if (found) return found;
      }
    }
    return null;
  }

  updateBlockVisibility(_cx, shouldHide) {
    if (this.isOverlay) return;
    const block = this.findOwnLayoutBlock(layout());
    if (!block) return;
    this.blockId = block.id;

    const action = resolveVisibilityAction(block, this.hiddenByMod, shouldHide);
    if (action === "hide") {
      run("layout.hide", { id: block.id });
      this.hiddenByMod = true;
    } else if (action === "show") {
      run("layout.show", { id: block.id });
      this.hiddenByMod = false;
    }
  }

  clearSelectionState() {
    this.detailGen += 1;
    this.highlightedId = null;
    this.selectedId = null;
    this.loadingDetailId = null;
    this.detailState = "idle";
    this.detailError = null;
    this.selectedIssue = null;
    this.selectedDeps = [];
    this.contextMenu = null;
  }

  clearBvState() {
    this.bvGen += 1;
    this.bvMode = null;
    this.bvState = "idle";
    this.bvError = null;
    this.bvNext = null;
    this.bvTriage = [];
  }

  resetProjectState() {
    this.projectGen += 1;

    this.listState = "idle";
    this.listError = null;
    this.issues = [];
    this.readyIds = new Set();
    this.totalIssues = 0;
    this.hasMoreIssues = false;

    this.clearSelectionState();
    this.bvAvailable = false;
    this.clearBvState();
  }

  restoreSelectionForContext(context) {
    if (!context?.key) return;
    const sharedSel = readSharedSelection(context.key);
    const initialIssueId = this.initialPopupIssueId;
    const initialFilter = this.initialPopupFilter;
    this.initialPopupIssueId = null;
    this.initialPopupFilter = null;

    const nextFilter = initialFilter ?? sharedSel?.filter ?? this.filter;
    if (nextFilter === "ready" || nextFilter === "active") {
      this.filter = nextFilter;
    }

    const nextSelectedId = initialIssueId ?? sharedSel?.selectedId ?? null;
    const nextHighlightedId = initialIssueId ?? sharedSel?.highlightedId ?? nextSelectedId;
    if (nextSelectedId) {
      this.selectedId = nextSelectedId;
    }
    if (nextHighlightedId) {
      this.highlightedId = nextHighlightedId;
    }
  }

  syncSettings() {
    const nextSettings = parseSettings(herdrSharedStorage.get(SETTINGS_SHARED_KEY));
    if (!this.appSettings || !settingsEqual(this.appSettings, nextSettings)) {
      this.appSettings = nextSettings;
    }
    return this.appSettings;
  }

  updateSetting(patch, cx) {
    this.appSettings = mergeSettings(this.appSettings, patch);
    setShared(SETTINGS_SHARED_KEY, serializeSettings(this.appSettings));
    cx.notify();
  }

  fs(n) {
    return scaleFont(n, (this.appSettings ?? DEFAULT_SETTINGS).fontScale);
  }

  syncProjectLayoutForContext(context = this.currentContext) {
    const nextProjectKey = projectKeyForContext(context);
    if (nextProjectKey !== this.projectKey) {
      this.dividerDragging = false;
      this.dividerDragStart = null;
      this.dividerHovered = false;
    }
    const latestLayout = loadProjectDetailsLayout({
      context,
      projectKey: nextProjectKey,
      storage: herdrSharedStorage,
      fallbackStorage: getFallbackLocalStorage(),
      fallbackRatio: DEFAULT_DETAILS_RATIO
    });
    this.projectKey = latestLayout.projectKey;
    if (!this.dividerDragging) {
      this.detailsRatio = latestLayout.detailRatio;
    }
    this.detailsCollapsed = latestLayout.detailsCollapsed;
    if (this.detailsCollapsed) {
      this.dividerDragging = false;
      this.dividerDragStart = null;
      this.dividerHovered = false;
    }
    return latestLayout;
  }

  syncFromSharedState(cx) {
    this.syncSettings();
    const activeContext = getActiveContext(this.currentContext ?? null);
    const latestLayout = loadProjectDetailsLayout({
      context: activeContext,
      projectKey: this.projectKey || projectKeyForContext(activeContext),
      storage: herdrSharedStorage,
      fallbackStorage: getFallbackLocalStorage(),
      fallbackRatio: this.detailsRatio
    });
    this.projectKey = latestLayout.projectKey;
    if (Math.abs(latestLayout.detailRatio - this.detailsRatio) > 0.0001 && !this.dividerDragging) {
      this.detailsRatio = latestLayout.detailRatio;
    }
    if (latestLayout.detailsCollapsed !== this.detailsCollapsed) {
      this.detailsCollapsed = latestLayout.detailsCollapsed;
      if (this.detailsCollapsed) {
        this.dividerDragging = false;
        this.dividerDragStart = null;
        this.dividerHovered = false;
      }
    }

    if (!this.contextKey || this.popupMode === "detail") return;
    const sharedSel = readSharedSelection(this.contextKey);
    if (!sharedSel) return;

    if (
      (sharedSel.filter === "ready" || sharedSel.filter === "active") &&
      sharedSel.filter !== this.filter
    ) {
      this.filter = sharedSel.filter;
    }

    if (
      sharedSel.selectedId &&
      sharedSel.selectedId !== this.selectedId &&
      this.issues.some((issue) => issue.id === sharedSel.selectedId)
    ) {
      this.highlightedId = sharedSel.highlightedId ?? sharedSel.selectedId;
      const context = getActiveContext(this.currentContext ?? null);
      if (context.supported && context.cwd) {
        this.loadIssueDetails(sharedSel.selectedId, cx, context, false, false);
      }
    }
  }

  syncContext(cx) {
    this.syncOverlayProps();
    const context = getActiveContext(this.currentContext ?? null);
    if (context.key === this.contextKey) {
      this.currentContext = context;
      return context;
    }
    this.contextKey = context.key;
    this.currentContext = context;
    this.syncProjectLayoutForContext(context);
    this.resetProjectState();
    this.restoreSelectionForContext(context);
    this.lastProbeTime = 0;
    this.probeState = "idle";
    if (context.supported) {
      if (this.popupMode === "detail") {
        this.listState = "ready";
        if (this.selectedId) {
          this.loadIssueDetails(this.selectedId, cx, context, true, false);
        }
      } else {
        this.refreshIssues(cx, context, false);
      }
    } else {
      this.updateBlockVisibility(cx, true);
    }
    return context;
  }

  visibleIssues() {
    return filterIssues(this.issues, this.readyIds, this.filter);
  }

  setFilter(nextFilter, cx) {
    if (this.filter === nextFilter) return;
    this.filter = nextFilter;
    this.contextMenu = null;
    const visible = this.visibleIssues();
    const decision = resolveSelection({
      visibleIssues: visible,
      selectedId: this.selectedId,
      force: false
    });
    const loadDetails = shouldLoadDetails({
      selectedId: decision.selectedId,
      currentSelectedId: this.selectedId,
      forceReload: false
    });
    this.highlightedId = resolveHighlightId({
      visibleIssues: visible,
      highlightedId: this.highlightedId,
      selectedId: decision.selectedId
    });

    if (!decision.selectedId) {
      this.clearSelectionState();
      writeSharedSelection({
        contextKey: this.contextKey,
        selectedId: null,
        highlightedId: null,
        filter: this.filter
      });
    } else if (loadDetails) {
      const context = getActiveContext(this.currentContext ?? null);
      this.loadIssueDetails(decision.selectedId, cx, context, false, true);
    } else {
      writeSharedSelection({
        contextKey: this.contextKey,
        selectedId: this.selectedId,
        highlightedId: this.highlightedId,
        filter: this.filter
      });
    }
    cx.notify();
  }

  refreshIssues(cx, explicitContext = null, notify = true) {
    const context = explicitContext ?? getActiveContext(this.currentContext ?? null);
    if (!context.supported || !context.cwd) {
      this.updateBlockVisibility(cx, true);
      if (notify) cx.notify();
      return;
    }
    if (this.popupMode === "detail" && this.selectedId) {
      this.listState = "ready";
      this.loadIssueDetails(this.selectedId, cx, context, true, notify);
      return;
    }
    if (this.listState === "loading" || this.probeState === "loading") {
      return;
    }

    const gen = this.projectGen + 1;
    this.projectGen = gen;
    this.listState = "loading";
    this.listError = null;
    this.bvAvailable = false;
    this.contextMenu = null;
    if (notify) cx.notify();

    cx.spawn(async (asyncCx) => {
      try {
        const data = await this.cli.loadIssues(context);
        if (this.projectGen !== gen || this.closed) return;

        writeSharedContext(context);
        this.issues = data.issues;
        this.totalIssues = data.total;
        this.hasMoreIssues = data.hasMore;
        this.readyIds = data.readyIds;
        this.bvAvailable = data.bvAvailable;
        if (!data.bvAvailable) {
          this.clearBvState();
        }
        this.listState = data.issues.length > 0 ? "ready" : "empty";
        this.listError = null;
        this.probeState = "ready";
        this.lastProbeTime = Date.now();
        this.updateBlockVisibility(asyncCx, false);

        const visible = this.visibleIssues();
        const decision = resolveSelection({
          visibleIssues: visible,
          selectedId: this.selectedId,
          force: false
        });
        const currentSelectedId = this.selectedId;
        const loadDetails = shouldLoadDetails({
          selectedId: decision.selectedId,
          currentSelectedId,
          forceReload: true
        });
        this.highlightedId = resolveHighlightId({
          visibleIssues: visible,
          highlightedId: this.highlightedId,
          selectedId: decision.selectedId
        });

        if (!decision.selectedId) {
          this.clearSelectionState();
          writeSharedSelection({
            contextKey: context.key,
            selectedId: null,
            highlightedId: null,
            filter: this.filter
          });
        } else if (loadDetails) {
          this.loadIssueDetails(decision.selectedId, asyncCx, context, true, false);
        }
      } catch (err) {
        if (this.projectGen !== gen || this.closed) return;
        this.issues = [];
        this.readyIds = new Set();
        this.totalIssues = 0;
        this.hasMoreIssues = false;
        this.bvAvailable = false;
        this.clearSelectionState();
        this.clearBvState();

        const shouldHide = isNotInitializedError(err) || isExecRejectionError(err);
        this.probeState = shouldHide ? "error" : "ready";
        this.lastProbeTime = Date.now();

        if (shouldHide) {
          this.listState = "idle";
          this.listError = null;
          this.updateBlockVisibility(asyncCx, true);
        } else {
          this.listState = "error";
          this.listError = formatError(err, "Unable to load Beads issues for this folder.");
          this.updateBlockVisibility(asyncCx, false);
        }
      }
      asyncCx.notify();
    });
  }

  selectIssue(issueId, cx) {
    if (!issueId) return;
    const context = getActiveContext(this.currentContext ?? null);
    if (!context.supported || !context.cwd) return;
    this.contextMenu = null;
    this.highlightedId = issueId;
    writeSharedContext(context);
    writeSharedSelection({
      contextKey: context.key,
      selectedId: issueId,
      highlightedId: issueId,
      filter: this.filter
    });
    this.loadIssueDetails(issueId, cx, context, false, true);
  }

  loadIssueDetails(issueId, cx, context, forceReload = false, notify = true) {
    if (!issueId || !context?.cwd) return;
    if (
      !forceReload &&
      this.detailState === "loading" &&
      this.loadingDetailId === issueId
    ) {
      return;
    }

    const projectGen = this.projectGen;
    const detailGen = this.detailGen + 1;
    this.detailGen = detailGen;
    this.selectedId = issueId;
    this.loadingDetailId = issueId;
    this.detailState = "loading";
    this.detailError = null;
    if (notify) cx.notify();

    cx.spawn(async (asyncCx) => {
      try {
        const { issue: detail, dependencies: deps } = await this.cli.loadIssue(issueId, context);
        if (this.projectGen !== projectGen || this.detailGen !== detailGen || this.closed) return;
        if (isStaleSelectionRequest({ requestedId: issueId, currentSelectedId: this.selectedId })) return;

        writeSharedContext(context);
        writeSharedSelection({
          contextKey: context.key,
          selectedId: issueId,
          highlightedId: this.highlightedId ?? issueId,
          filter: this.filter
        });
        this.selectedIssue = detail;
        this.selectedDeps = deps;
        this.loadingDetailId = null;
        this.detailState = "ready";
        this.detailError = null;
      } catch (err) {
        if (this.projectGen !== projectGen || this.detailGen !== detailGen || this.closed) return;
        this.selectedIssue = null;
        this.selectedDeps = [];
        this.loadingDetailId = null;
        this.detailState = "error";
        this.detailError = formatError(err, `Unable to load details for ${issueId}.`);
      }
      asyncCx.notify();
    });
  }

  openIssueContextMenu(issue, event, cx) {
    if (!issue?.id) return;
    const context = getActiveContext(this.currentContext ?? null);
    if (!this.canOpenDetailPopup(context)) {
      return;
    }
    this.handle.focus();
    this.highlightedId = issue.id;
    this.contextMenu = {
      issueId: issue.id,
      issueTitle: issue.title || issue.id
    };
    event && cx.stop_propagation();
    cx.notify();
  }

  closeContextMenu(cx = null) {
    if (!this.contextMenu) return;
    this.contextMenu = null;
    if (cx) {
      cx.notify();
    }
  }

  computeCurrentPopupLayout(mode = "detail") {
    const viewport = measureViewportSize(this.panelWidth, this.panelHeight);
    return computePopupLayout({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mode,
      detailsRatio: this.detailsRatio,
      detailsCollapsed: this.detailsCollapsed
    });
  }

  openIssueDetailPopup(issueId, cx) {
    const context = getActiveContext(this.currentContext ?? null);
    if (!this.canOpenDetailPopup(context)) {
      this.closeContextMenu(cx);
      return;
    }

    const candidateId = issueId ?? this.selectedId;
    const targetId =
      typeof candidateId === "string" && candidateId
        ? candidateId
        : null;
    if (!targetId) {
      this.closeContextMenu(cx);
      return;
    }

    this.contextMenu = null;
    this.highlightedId = targetId;
    if (this.selectedId !== targetId) {
      this.loadIssueDetails(targetId, cx, context, false, false);
    }
    writeSharedContext(context);
    writeSharedSelection({
      contextKey: context.key,
      selectedId: targetId,
      highlightedId: targetId,
      filter: this.filter
    });

    const popupLayout = this.computeCurrentPopupLayout("detail");
    openOverlay({
      mod: "beads-desktop",
      kind: "dialog",
      key: POPUP_OVERLAY_KEY,
      width: popupLayout.width,
      height: popupLayout.height,
      props: {
        mode: "detail",
        issueId: targetId,
        filter: this.filter,
        popupWidth: popupLayout.width,
        popupHeight: popupLayout.height,
        context: {
          key: context.key,
          supported: context.supported,
          cwd: context.cwd,
          tabId: context.tabId,
          spaceId: context.spaceId,
          spaceName: context.spaceName,
          reason: context.reason,
          machine: context.machine
        }
      }
    });
    cx.notify();
  }

  openBoardPopup(cx) {
    const context = getActiveContext(this.currentContext ?? null);
    if (!this.canOpenBoardPopup(context)) {
      this.closeContextMenu(cx);
      return;
    }

    this.contextMenu = null;
    writeSharedContext(context);
    writeSharedSelection({
      contextKey: context.key,
      selectedId: this.selectedId,
      highlightedId: this.highlightedId ?? this.selectedId,
      filter: this.filter
    });
    this.persistDetailsRatio(this.detailsRatio);

    const previousOverlayId = this.popupMode === "detail" ? this.overlayId : null;
    const popupLayout = this.computeCurrentPopupLayout("board");
    const nextOverlayId = openOverlay({
      mod: "beads-desktop",
      kind: "dialog",
      key: POPUP_OVERLAY_KEY,
      width: popupLayout.width,
      height: popupLayout.height,
      props: {
        mode: "board",
        issueId: this.selectedId ?? this.highlightedId,
        filter: this.filter,
        popupWidth: popupLayout.width,
        popupHeight: popupLayout.height,
        context: {
          key: context.key,
          supported: context.supported,
          cwd: context.cwd,
          tabId: context.tabId,
          spaceId: context.spaceId,
          spaceName: context.spaceName,
          reason: context.reason,
          machine: context.machine
        }
      }
    });
    if (previousOverlayId && previousOverlayId !== nextOverlayId) {
      closeOverlay(previousOverlayId);
      return;
    }
    cx.notify();
  }

  closeCurrentOverlay() {
    this.syncOverlayProps();
    if (!this.overlayId) return;
    closeOverlay(this.overlayId);
  }

  runBvAction(mode, cx) {
    const context = getActiveContext(this.currentContext ?? null);
    if (!context.supported || !context.cwd) return;
    if (this.listState !== "ready" && this.listState !== "empty") return;
    if (!this.bvAvailable) return;
    if (this.bvState === "loading") return;

    const projectGen = this.projectGen;
    const bvGen = this.bvGen + 1;
    this.bvGen = bvGen;

    this.bvMode = mode;
    this.bvState = "loading";
    this.bvError = null;
    cx.notify();

    const flag = mode === "next" ? "--robot-next" : "--robot-triage";
    cx.spawn(async (asyncCx) => {
      try {
        const result = await this.cli.runBvAction(mode, context);
        if (this.projectGen !== projectGen || this.bvGen !== bvGen || this.closed) return;

        if (mode === "next") {
          this.bvNext = result;
          this.bvTriage = [];
          this.bvState = result.actionable && result.recommendation ? "ready" : "empty";
        } else {
          this.bvTriage = result;
          this.bvNext = null;
          this.bvState = result.length > 0 ? "ready" : "empty";
        }
        this.bvError = null;
      } catch (err) {
        if (this.projectGen !== projectGen || this.bvGen !== bvGen || this.closed) return;
        this.bvNext = null;
        this.bvTriage = [];
        this.bvState = "error";
        this.bvError = formatError(err, `bv ${flag} failed.`);
      }
      asyncCx.notify();
    });
  }

  handleKeyDown(event, cx) {
    if (event.modifiers?.control || event.modifiers?.platform || event.modifiers?.alt) {
      return;
    }
    const key = (event.key || "").toLowerCase();
    if (key === "escape") {
      if (this.contextMenu) {
        cx.stop_propagation();
        this.closeContextMenu(cx);
        return;
      }
      if (this.showSettings) {
        this.showSettings = false;
        cx.stop_propagation();
        cx.notify();
        return;
      }
      if (this.isOverlay && this.overlayId) {
        cx.stop_propagation();
        this.closeCurrentOverlay();
        return;
      }
    }
    if (key === "r") {
      cx.stop_propagation();
      this.refreshIssues(cx);
      return;
    }

    if (this.popupMode === "detail" || this.showSettings) return;

    if (
      key === "d" &&
      this.currentContext?.supported &&
      (this.listState === "ready" || this.listState === "empty")
    ) {
      cx.stop_propagation();
      this.toggleDetailsCollapsed(cx);
      return;
    }

    const visible = this.visibleIssues();
    if (visible.length === 0) return;

    const currentIndex = visible.findIndex((issue) => issue.id === this.highlightedId);
    if (key === "down" || key === "arrowdown") {
      cx.stop_propagation();
      const nextIndex = currentIndex < 0 ? 0 : Math.min(visible.length - 1, currentIndex + 1);
      this.highlightedId = visible[nextIndex].id;
      cx.notify();
    } else if (key === "up" || key === "arrowup") {
      cx.stop_propagation();
      const prevIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
      this.highlightedId = visible[prevIndex].id;
      cx.notify();
    } else if (key === "enter") {
      cx.stop_propagation();
      const targetId = this.highlightedId ?? visible[0]?.id;
      if (targetId) {
        this.selectIssue(targetId, cx);
      }
    }
  }

  renderButtonGlyph(iconName, colors, size = 13) {
    return svg("mods/beads-desktop/icons/" + iconName + ".svg")
      .w(size)
      .h(size)
      .text_color(colors.text);
  }

  renderActionButton({ id, label, icon, colors, disabled = false, tooltip, onActivate }) {
    const iconMode =
      (this.appSettings ?? DEFAULT_SETTINGS).buttonContent === "icon" && Boolean(icon);
    const resolvedTooltip = tooltip || label;

    return div()
      .id(id)
      .px(iconMode ? 6 : 8)
      .py(iconMode ? 4 : 3)
      .rounded(5)
      .border_1()
      .border_color(colors.border)
      .bg(colors.bg)
      .text_size(this.fs(11))
      .text_color(colors.text)
      .when(Boolean(resolvedTooltip), (el) => el.tooltip(resolvedTooltip))
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(colors.hoverBg)))
      .on_click((e, cx) => {
        if (disabled) return;
        onActivate(e, cx);
      })
      .child(iconMode ? this.renderButtonGlyph(icon, colors) : label);
  }

  renderHeader(context, visibleCount, t) {
    this.syncOverlayProps();
    const isDetailPopup = this.popupMode === "detail";
    const showBoardPopupAction = this.canOpenBoardPopup(context);
    const isBusy = isDetailPopup ? this.detailState === "loading" : this.listState === "loading";
    const boardPopupDisabled =
      !showBoardPopupAction ||
      (!isDetailPopup && this.listState !== "ready" && this.listState !== "empty");
    const countLabel = isDetailPopup
      ? this.selectedId || "Detail"
      : this.listState === "ready" || this.listState === "empty"
        ? `${visibleCount} shown · ${this.issues.length}/${this.totalIssues}`
        : "—";
    const divider = dividerColors({}, t);
    const settingsColors = controlColors(
      {
        active: this.showSettings,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const refreshColors = controlColors(
      {
        loading: isBusy,
        disabled: !context.supported,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const actionColors = controlColors(
      {
        disabled: boardPopupDisabled,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const closeColors = controlColors(
      {
        variant: this.appSettings.buttonVariant
      },
      t
    );

    return v_flex()
      .flex_none()
      .px(12)
      .py(10)
      .gap(6)
      .border_b(1)
      .border_color(divider.color)
      .bg(t.chrome)
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_between()
          .gap(8)
          .child(
            h_flex()
              .min_w(0)
              .items_center()
              .gap(6)
              .child(
                div()
                  .font_semibold()
                  .text_size(this.fs(13))
                  .text_color(t.foreground)
                  .child(isDetailPopup ? "Issue Details" : "Beads")
              )
              .child(
                div()
                  .px(6)
                  .py(1)
                  .rounded(4)
                  .border_1()
                  .border_color(t.border)
                  .text_size(this.fs(10))
                  .text_color(t.muted)
                  .child(countLabel)
              )
          )
          .child(
            h_flex()
              .items_center()
              .gap(4)
              .child(
                this.renderActionButton({
                  id: "beads-settings-toggle",
                  label: "Settings",
                  icon: "settings",
                  colors: settingsColors,
                  disabled: false,
                  tooltip: "Settings",
                  onActivate: (_e, cx) => {
                    this.handle.focus();
                    this.contextMenu = null;
                    this.showSettings = !this.showSettings;
                    cx.notify();
                  }
                })
              )
              .when(!this.isOverlay || isDetailPopup, (row) =>
                row.child(
                  this.renderActionButton({
                    id: "beads-open-board-popup",
                    label: isDetailPopup ? "Full Board" : "Popup",
                    icon: "expand",
                    colors: actionColors,
                    disabled: boardPopupDisabled,
                    tooltip: "Open full Beads board in popup",
                    onActivate: (_e, cx) => {
                      if (boardPopupDisabled) return;
                      this.handle.focus();
                      this.openBoardPopup(cx);
                    }
                  })
                )
              )
              .child(
                this.renderActionButton({
                  id: "beads-refresh",
                  label: isBusy ? "Loading…" : "Refresh (r)",
                  icon: "refresh",
                  colors: refreshColors,
                  disabled: !context.supported || isBusy,
                  tooltip: isBusy ? "Loading…" : "Refresh (r)",
                  onActivate: (_e, cx) => {
                    this.handle.focus();
                    this.refreshIssues(cx);
                  }
                })
              )
              .when(Boolean(this.isOverlay && this.overlayId), (row) =>
                row.child(
                  this.renderActionButton({
                    id: "beads-close-overlay",
                    label: "Close (Esc)",
                    icon: "close",
                    colors: closeColors,
                    disabled: false,
                    tooltip: "Close (Esc)",
                    onActivate: () => {
                      this.closeCurrentOverlay();
                    }
                  })
                )
              )
          )
      )
      .child(
        h_flex()
          .w_full()
          .min_w(0)
          .items_center()
          .gap(6)
          .child(div().text_size(this.fs(11)).text_color(t.dim).child("Space:"))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(this.fs(11))
              .text_color(t.muted)
              .child(context.cwd ? `${context.spaceName} (${context.cwd})` : context.spaceName)
          )
      );
  }

  renderSegmented({ idPrefix, label, options, value, onSelect, t }) {
    return v_flex()
      .id(`${idPrefix}-group`)
      .w_full()
      .min_w(0)
      .p(10)
      .gap(6)
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.surface)
      .child(
        div()
          .font_semibold()
          .text_size(this.fs(11))
          .text_color(t.foreground)
          .child(label)
      )
      .child(
        h_flex()
          .w_full()
          .min_w(0)
          .flex_wrap()
          .items_center()
          .gap(6)
          .children(
            options.map((option) => {
              const active = option.value === value;
              const optionId = option.id || `${idPrefix}-${option.key}`;
              const colors = controlColors(
                {
                  active,
                  mutedWhenInactive: true,
                  variant: this.appSettings.buttonVariant
                },
                t
              );

              return div()
                .id(optionId)
                .px(10)
                .py(4)
                .rounded(5)
                .border_1()
                .border_color(colors.border)
                .bg(colors.bg)
                .text_size(this.fs(11))
                .when(active, (el) => el.font_semibold())
                .text_color(colors.text)
                .cursor_pointer()
                .hover((s) => s.bg(colors.hoverBg))
                .on_click((_e, cx) => {
                  this.handle.focus();
                  onSelect(option.value, cx);
                })
                .child(option.label);
            })
          )
      );
  }

  renderSettingsView(t) {
    const backColors = controlColors(
      {
        variant: this.appSettings.buttonVariant
      },
      t
    );

    return v_flex()
      .id("beads-settings-view")
      .flex_1()
      .min_h(0)
      .w_full()
      .min_w(0)
      .overflow_y_scrollbar()
      .p(12)
      .gap(10)
      .bg(t.background)
      .child(
        h_flex()
          .w_full()
          .min_w(0)
          .items_center()
          .justify_between()
          .gap(8)
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(2)
              .child(
                div()
                  .font_semibold()
                  .text_size(this.fs(13))
                  .text_color(t.foreground)
                  .child("Settings")
              )
              .child(
                div()
                  .w_full()
                  .min_w(0)
                  .text_size(this.fs(11))
                  .text_color(t.muted)
                  .child("These apply to every Beads panel and popup.")
              )
          )
          .child(
            this.renderActionButton({
              id: "beads-settings-back",
              label: "Back",
              icon: "back",
              colors: backColors,
              disabled: false,
              tooltip: "Back",
              onActivate: (_e, cx) => {
                this.handle.focus();
                this.showSettings = false;
                cx.notify();
              }
            })
          )
      )
      .child(
        this.renderSegmented({
          idPrefix: "setting-font",
          label: "Text size",
          value: this.appSettings.fontScale,
          options: [
            { id: "setting-font-small", key: "small", label: "Small", value: FONT_SCALES[0] },
            { id: "setting-font-default", key: "default", label: "Default", value: FONT_SCALES[1] },
            { id: "setting-font-large", key: "large", label: "Large", value: FONT_SCALES[2] }
          ],
          onSelect: (nextValue, cx) => this.updateSetting({ fontScale: nextValue }, cx),
          t
        })
      )
      .child(
        this.renderSegmented({
          idPrefix: "setting-buttons",
          label: "Buttons",
          value: this.appSettings.buttonVariant,
          options: [
            { id: "setting-buttons-ghost", key: "ghost", label: "Ghost", value: "ghost" },
            { id: "setting-buttons-solid", key: "solid", label: "Full color", value: "solid" }
          ],
          onSelect: (nextValue, cx) => this.updateSetting({ buttonVariant: nextValue }, cx),
          t
        })
      )
      .child(
        this.renderSegmented({
          idPrefix: "setting-content",
          label: "Button labels",
          value: this.appSettings.buttonContent,
          options: [
            { id: "setting-content-text", key: "text", label: "Text", value: "text" },
            { id: "setting-content-icon", key: "icon", label: "Icons", value: "icon" }
          ],
          onSelect: (nextValue, cx) => this.updateSetting({ buttonContent: nextValue }, cx),
          t
        })
      )
      .child(
        this.renderSegmented({
          idPrefix: "setting-details",
          label: "Details",
          value: this.appSettings.detailsRender,
          options: [
            { id: "setting-details-rendered", key: "rendered", label: "Rendered", value: "rendered" },
            { id: "setting-details-raw", key: "raw", label: "Raw", value: "raw" }
          ],
          onSelect: (nextValue, cx) => this.updateSetting({ detailsRender: nextValue }, cx),
          t
        })
      )
      .child(
        v_flex()
          .w_full()
          .min_w(0)
          .gap(4)
          .child(
            this.renderSegmented({
              idPrefix: "setting-mermaid",
              label: "Mermaid diagrams",
              value: this.appSettings.mermaidRender,
              options: [
                { id: "setting-mermaid-on", key: "on", label: "Render", value: true },
                { id: "setting-mermaid-off", key: "off", label: "Off", value: false }
              ],
              onSelect: (nextValue, cx) => this.updateSetting({ mermaidRender: nextValue }, cx),
              t
            })
          )
          .child(
            div()
              .w_full()
              .min_w(0)
              .px(2)
              .text_size(this.fs(10))
              .text_color(t.muted)
              .child(
                "Rendered through mermaid.ink; diagram source leaves this machine. Off shows the diagram source instead."
              )
          )
      );
  }

  renderControls(context, t) {
    const readyCount = this.issues.filter((issue) => this.readyIds.has(issue.id)).length;
    const divider = dividerColors({}, t);
    const filterButton = (id, label, filterValue) => {
      const active = this.filter === filterValue;
      const colors = controlColors(
        {
          active,
          mutedWhenInactive: true,
          variant: this.appSettings.buttonVariant
        },
        t
      );
      return div()
        .id(id)
        .px(8)
        .py(3)
        .rounded(5)
        .border_1()
        .border_color(colors.border)
        .bg(colors.bg)
        .text_size(this.fs(11))
        .text_color(colors.text)
        .cursor_pointer()
        .hover((s) => s.bg(colors.hoverBg))
        .on_click((_e, cx) => {
          this.handle.focus();
          this.setFilter(filterValue, cx);
        })
        .child(label);
    };

    const bvButton = (id, label, mode) => {
      const active = this.bvMode === mode && this.bvState !== "idle";
      const disabled = !context.supported || this.bvState === "loading";
      const colors = controlColors(
        {
          active,
          disabled,
          variant: this.appSettings.buttonVariant
        },
        t
      );
      return div()
        .id(id)
        .px(8)
        .py(3)
        .rounded(5)
        .border_1()
        .border_color(colors.border)
        .bg(colors.bg)
        .text_size(this.fs(11))
        .text_color(colors.text)
        .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(colors.hoverBg)))
        .on_click((_e, cx) => {
          this.handle.focus();
          this.runBvAction(mode, cx);
        })
        .child(this.bvState === "loading" && this.bvMode === mode ? `${label}…` : label);
    };

    const bvSection = this.bvAvailable
      ? h_flex()
          .items_center()
          .gap(4)
          .child(bvButton("bv-next", "BV Next", "next"))
          .child(bvButton("bv-triage", "BV Triage", "triage"))
      : div()
          .id("bv-unavailable")
          .px(6)
          .py(2)
          .rounded(4)
          .bg(t.raised)
          .text_size(this.fs(10))
          .text_color(t.dim)
          .child("BV unavailable");

    return h_flex()
      .flex_none()
      .px(12)
      .py(8)
      .gap(6)
      .items_center()
      .justify_between()
      .border_b(1)
      .border_color(divider.color)
      .child(
        h_flex()
          .items_center()
          .gap(4)
          .child(filterButton("filter-active", `Active (${this.issues.length})`, "active"))
          .child(filterButton("filter-ready", `Ready (${readyCount})`, "ready"))
      )
      .child(bvSection);
  }

  renderContextMenuForIssue(issue, t) {
    if (!issue?.id || this.contextMenu?.issueId !== issue.id) {
      return null;
    }
    const openColors = controlColors(
      {
        active: false,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const dismissColors = controlColors(
      {
        mutedWhenInactive: true,
        variant: this.appSettings.buttonVariant
      },
      t
    );

    return v_flex()
      .id(`beads-issue-context-menu-${issue.id}`)
      .role("menu")
      .w(196)
      .p(6)
      .gap(4)
      .rounded(6)
      .border_1()
      .border_color(t.accent)
      .bg(t.popover)
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
      })
      .on_mouse_down_out((_e, outCx) => {
        this.closeContextMenu(outCx);
      })
      .child(
        div()
          .px(6)
          .py(2)
          .truncate()
          .text_size(this.fs(10))
          .font_semibold()
          .text_color(t.muted)
          .child(`${issue.id}`)
      )
      .child(
        div()
          .id(`context-open-detail-popup-${issue.id}`)
          .role("menu_item")
          .w_full()
          .px(8)
          .py(5)
          .rounded(4)
          .border_1()
          .border_color(openColors.border)
          .bg(openColors.bg)
          .text_size(this.fs(11))
          .font_semibold()
          .text_color(openColors.text)
          .cursor_pointer()
          .hover((s) => s.bg(openColors.hoverBg))
          .on_click((_e, clickCx) => {
            clickCx.stop_propagation();
            this.handle.focus();
            this.openIssueDetailPopup(issue.id, clickCx);
          })
          .child("Open details in popup")
      )
      .child(
        div()
          .id(`context-dismiss-${issue.id}`)
          .role("menu_item")
          .w_full()
          .px(8)
          .py(4)
          .rounded(4)
          .text_size(this.fs(11))
          .text_color(dismissColors.text)
          .cursor_pointer()
          .hover((s) => s.bg(dismissColors.hoverBg))
          .on_click((_e, clickCx) => {
            clickCx.stop_propagation();
            this.closeContextMenu(clickCx);
          })
          .child("Cancel")
      );
  }

  renderPill(label, pillColors, bold = false) {
    return div()
      .flex_none()
      .px(5)
      .py(1)
      .rounded(999)
      .border_1()
      .border_color(pillColors.border)
      .bg(pillColors.bg)
      .text_size(this.fs(10))
      .when(bold, (el) => el.font_semibold())
      .text_color(pillColors.text)
      .child(label);
  }

  renderBvRecommendationCard(rec, keyPrefix, t) {
    const canSelect = Boolean(rec.id && this.issues.some((issue) => issue.id === rec.id));
    const allowDetailPopup = canSelect && this.canOpenDetailPopup(this.currentContext);
    const scoreText = typeof rec.score === "number" ? `score ${rec.score.toFixed(2)}` : null;
    const isSelected = Boolean(rec.id && this.selectedId === rec.id);
    const cardColors = rowColors({ selected: isSelected, highlighted: false }, t);
    const pPill = rec.priority !== null ? priorityPillColors(rec.priority, t) : null;
    const matchedIssue = rec.id ? this.issues.find((issue) => issue.id === rec.id) ?? null : null;
    const tPill = matchedIssue?.issueType ? typePillColors(matchedIssue.issueType, t) : null;
    const sPill = matchedIssue?.status ? statusPillColors(matchedIssue.status, t) : null;
    const hasContextMenu = Boolean(allowDetailPopup && rec.id && this.contextMenu?.issueId === rec.id);

    const card = v_flex()
      .id(`${keyPrefix}-${rec.id || "item"}`)
      .w_full()
      .min_w(0)
      .p(8)
      .gap(4)
      .rounded(6)
      .border_1()
      .border_color(cardColors.border)
      .bg(cardColors.bg)
      .when(canSelect, (el) => el.cursor_pointer().hover((s) => s.bg(cardColors.hoverBg)))
      .when(allowDetailPopup, (el) =>
        el.on_mouse_down("right", (event, cx) => {
          this.openIssueContextMenu({ id: rec.id, title: rec.title }, event, cx);
        })
      )
      .on_click((_e, cx) => {
        this.handle.focus();
        if (canSelect) {
          this.selectIssue(rec.id, cx);
        }
      })
      .child(
        h_flex()
          .w_full()
          .min_w(0)
          .items_center()
          .justify_between()
          .gap(6)
          .child(
            h_flex()
              .flex_1()
              .min_w(0)
              .items_center()
              .gap(6)
              .child(
                div()
                  .flex_none()
                  .font_semibold()
                  .text_size(this.fs(11))
                  .text_color(t.accent)
                  .child(rec.id || "unknown")
              )
              .child(
                div()
                  .flex_1()
                  .min_w(0)
                  .truncate()
                  .text_size(this.fs(12))
                  .text_color(cardColors.text)
                  .child(rec.title || "Untitled")
              )
          )
          .child(
            h_flex()
              .flex_none()
              .items_center()
              .gap(4)
              .when(Boolean(pPill), (el) =>
                el.child(this.renderPill(`P${rec.priority}`, pPill, true))
              )
              .when(Boolean(tPill), (el) =>
                el.child(this.renderPill(matchedIssue.issueType, tPill))
              )
              .when(Boolean(sPill), (el) =>
                el.child(this.renderPill(matchedIssue.status, sPill))
              )
              .when(Boolean(scoreText), (el) =>
                el.child(div().flex_none().text_size(this.fs(10)).text_color(cardColors.dimText).child(scoreText))
              )
          )
      )
      .when(rec.reasons.length > 0, (el) =>
        el.child(
          div()
            .w_full()
            .min_w(0)
            .truncate()
            .text_size(this.fs(11))
            .text_color(cardColors.mutedText)
            .child(rec.reasons.join(" · "))
        )
      );

    if (!allowDetailPopup) {
      return card;
    }

    return Popup.new(`${keyPrefix}-popup-${rec.id || "item"}`, card)
      .anchor("bottom_left")
      .when(hasContextMenu, (el) =>
        el.content(this.renderContextMenuForIssue({ id: rec.id, title: rec.title }, t))
      );
  }

  renderBvSection(t) {
    if (this.bvState === "idle") {
      return null;
    }

    const heading = this.bvMode === "next" ? "BV Next Recommendation" : "BV Triage (Top 3)";
    const divider = dividerColors({}, t);
    const errColors = errorColors(t);

    return v_flex()
      .flex_none()
      .px(12)
      .py(8)
      .gap(6)
      .border_b(1)
      .border_color(divider.color)
      .bg(t.canvas)
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_between()
          .child(div().font_semibold().text_size(this.fs(11)).text_color(t.muted).child(heading))
          .child(
            div()
              .id("bv-clear")
              .px(5)
              .py(1)
              .rounded(4)
              .text_size(this.fs(10))
              .text_color(t.dim)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => {
                this.bvState = "idle";
                this.bvMode = null;
                this.bvError = null;
                cx.notify();
              })
              .child("Dismiss")
          )
      )
      .when(this.bvState === "loading", (el) =>
        el.child(div().text_size(this.fs(11)).text_color(t.muted).child("Running bv analysis…"))
      )
      .when(this.bvState === "error", (el) =>
        el.child(
          div()
            .w_full()
            .p(8)
            .rounded(6)
            .border_1()
            .border_color(errColors.border)
            .bg(errColors.bg)
            .text_size(this.fs(11))
            .text_color(errColors.text)
            .child(this.bvError || "BV analysis failed.")
        )
      )
      .when(this.bvState === "empty" && this.bvMode === "next", (el) =>
        el.child(
          div()
            .w_full()
            .p(8)
            .rounded(6)
            .border_1()
            .border_color(t.border)
            .bg(t.surface)
            .text_size(this.fs(11))
            .text_color(t.muted)
            .child(this.bvNext?.message || "No actionable item available.")
        )
      )
      .when(this.bvState === "empty" && this.bvMode === "triage", (el) =>
        el.child(
          div()
            .w_full()
            .p(8)
            .rounded(6)
            .border_1()
            .border_color(t.border)
            .bg(t.surface)
            .text_size(this.fs(11))
            .text_color(t.muted)
            .child("No triage recommendations available.")
        )
      )
      .when(this.bvState === "ready" && this.bvMode === "next" && Boolean(this.bvNext?.recommendation), (el) =>
        el.child(this.renderBvRecommendationCard(this.bvNext.recommendation, "bv-next-rec", t))
      )
      .when(this.bvState === "ready" && this.bvMode === "triage", (el) =>
        el.child(
          v_flex()
            .w_full()
            .gap(6)
            .children(
              this.bvTriage.map((rec, idx) =>
                this.renderBvRecommendationCard(rec, `bv-triage-${idx}`, t)
              )
            )
        )
      );
  }

  renderIssueRow(issue, t) {
    const isSelected = this.selectedId === issue.id;
    const isHighlighted = this.highlightedId === issue.id;
    const isReady = this.readyIds.has(issue.id);
    const allowDetailPopup = this.canOpenDetailPopup(this.currentContext);
    const hasContextMenu = Boolean(allowDetailPopup && this.contextMenu?.issueId === issue.id);
    const colors = rowColors({ selected: isSelected, highlighted: isHighlighted }, t);
    const pPill = priorityPillColors(issue.priority, t);
    const tPill = typePillColors(issue.issueType, t);
    const sPill = statusPillColors(issue.status, t);
    const rPill = statusPillColors("ready", t);

    const row = h_flex()
      .id(`issue-row-${issue.id}`)
      .w_full()
      .min_w(0)
      .flex_none()
      .px(10)
      .py(7)
      .gap(6)
      .items_center()
      .justify_between()
      .rounded(6)
      .border_1()
      .border_color(colors.border)
      .bg(colors.bg)
      .cursor_pointer()
      .hover((s) => s.bg(colors.hoverBg))
      .when(allowDetailPopup, (el) =>
        el.on_mouse_down("right", (event, cx) => {
          this.openIssueContextMenu(issue, event, cx);
        })
      )
      .on_click((_e, cx) => {
        this.handle.focus();
        this.selectIssue(issue.id, cx);
      })
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .items_center()
          .gap(6)
          .child(
            div()
              .flex_none()
              .font_semibold()
              .text_size(this.fs(11))
              .text_color(colors.mutedText)
              .child(issue.id)
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(this.fs(12))
              .text_color(colors.text)
              .child(issue.title || "Untitled issue")
          )
      )
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .gap(4)
          .child(this.renderPill(`P${issue.priority}`, pPill, true))
          .child(this.renderPill(issue.issueType, tPill))
          .child(this.renderPill(issue.status, sPill))
          .when(isReady, (el) => el.child(this.renderPill("ready", rPill, true)))
      );

    if (!allowDetailPopup) {
      return row;
    }

    return Popup.new(`issue-context-popup-${issue.id}`, row)
      .anchor("bottom_left")
      .when(hasContextMenu, (el) => el.content(this.renderContextMenuForIssue(issue, t)));
  }

  renderIssueList(visible, t) {
    return v_flex()
      .id("beads-issue-list")
      .flex_1()
      .min_h(0)
      .w_full()
      .overflow_y_scrollbar()
      .p(10)
      .gap(6)
      .when(this.listState === "loading", (el) =>
        el.child(div().p(8).text_size(this.fs(12)).text_color(t.muted).child("Loading issues from br…"))
      )
      .when(this.listState === "empty", (el) =>
        el.child(
          div()
            .p(10)
            .text_size(this.fs(12))
            .text_color(t.muted)
            .child("No open Beads issues found in this project.")
        )
      )
      .when(this.listState === "ready" && visible.length === 0, (el) =>
        el.child(
          div()
            .p(10)
            .text_size(this.fs(12))
            .text_color(t.muted)
            .child("No issues match the Ready filter.")
        )
      )
      .when(this.listState === "ready" && visible.length > 0, (el) =>
        el.children(visible.map((issue) => this.renderIssueRow(issue, t)))
      )
      .when(this.hasMoreIssues, (el) =>
        el.child(
          div()
            .px(6)
            .py(4)
            .text_size(this.fs(11))
            .text_color(t.dim)
            .child(`Showing first ${this.issues.length} of ${this.totalIssues} issues.`)
        )
      );
  }

  currentChromeHeight() {
    const baseChrome = 96;
    const bvChrome = this.bvAvailable && this.bvState !== "idle" ? 96 : 0;
    return baseChrome + bvChrome;
  }

  currentDetailsLayout() {
    return computeDetailsLayout({
      panelHeight: this.panelHeight,
      ratio: this.detailsRatio,
      collapsed: this.detailsCollapsed,
      chromeHeight: this.currentChromeHeight(),
      dividerHeight: DEFAULT_DIVIDER_HEIGHT
    });
  }

  persistDetailsRatio(ratio = this.detailsRatio) {
    const activeContext = getActiveContext(this.currentContext ?? null);
    const saved = saveProjectDetailsLayout(
      { detailRatio: ratio },
      {
        context: activeContext,
        projectKey: this.projectKey || projectKeyForContext(activeContext),
        storage: herdrSharedStorage,
        fallbackStorage: getFallbackLocalStorage(),
        panelHeight: this.panelHeight,
        chromeHeight: this.currentChromeHeight(),
        dividerHeight: DEFAULT_DIVIDER_HEIGHT,
        fallbackRatio: DEFAULT_DETAILS_RATIO
      }
    );
    this.projectKey = saved.projectKey;
    this.detailsRatio = saved.detailRatio;
    return {
      ratio: saved.detailRatio,
      persisted: saved.persisted
    };
  }

  setDetailsCollapsed(collapsed, cx = null) {
    const nextCollapsed = Boolean(collapsed);
    this.detailsCollapsed = nextCollapsed;
    if (nextCollapsed) {
      this.dividerDragging = false;
      this.dividerDragStart = null;
      this.dividerHovered = false;
    }
    const activeContext = getActiveContext(this.currentContext ?? null);
    const saved = saveProjectDetailsLayout(
      { detailsCollapsed: nextCollapsed },
      {
        context: activeContext,
        projectKey: this.projectKey || projectKeyForContext(activeContext),
        storage: herdrSharedStorage,
        fallbackStorage: getFallbackLocalStorage(),
        fallbackRatio: this.detailsRatio
      }
    );
    this.projectKey = saved.projectKey;
    if (cx) {
      cx.notify();
    }
    return saved;
  }

  toggleDetailsCollapsed(cx = null) {
    return this.setDetailsCollapsed(!this.detailsCollapsed, cx);
  }

  handlePanelSizeChange(size, cx) {
    const nextHeight =
      typeof size?.height === "number" && Number.isFinite(size.height) && size.height > 0
        ? Math.round(size.height)
        : null;
    const nextWidth =
      typeof size?.width === "number" && Number.isFinite(size.width) && size.width > 0
        ? Math.round(size.width)
        : null;

    let changed = false;
    if (nextHeight !== null && nextHeight !== this.panelHeight) {
      this.panelHeight = nextHeight;
      changed = true;
    }
    if (nextWidth !== null && nextWidth !== this.panelWidth) {
      this.panelWidth = nextWidth;
      changed = true;
    }
    if (changed) {
      cx.notify();
    }
  }

  startDividerDrag(event, cx) {
    if (this.detailsCollapsed) return;
    const pointerY = event?.position?.y;
    if (typeof pointerY !== "number" || !Number.isFinite(pointerY)) return;

    const layoutInfo = this.currentDetailsLayout();
    this.dividerDragging = true;
    this.dividerDragStart = {
      startY: pointerY,
      startRatio: layoutInfo.effectiveRatio,
      startDetailsHeight: layoutInfo.detailsHeight
    };
    cx.stop_propagation();
    cx.notify();
  }

  updateDividerDrag(event, cx) {
    if (this.detailsCollapsed || !this.dividerDragging || !this.dividerDragStart) return false;
    const pointerY = event?.position?.y;
    if (typeof pointerY !== "number" || !Number.isFinite(pointerY)) return false;

    const dragResult = resolveDividerDrag({
      pointerY,
      panelTop: event?.bounds?.y ?? 0,
      panelHeight: this.panelHeight,
      startY: this.dividerDragStart.startY,
      startRatio: this.dividerDragStart.startRatio,
      startDetailsHeight: this.dividerDragStart.startDetailsHeight,
      currentRatio: this.detailsRatio,
      collapsed: this.detailsCollapsed,
      chromeHeight: this.currentChromeHeight(),
      dividerHeight: DEFAULT_DIVIDER_HEIGHT
    });

    if (dragResult.changed) {
      this.detailsRatio = dragResult.ratio;
      cx.notify();
      return true;
    }
    return false;
  }

  finishDividerDrag(event, cx) {
    if (!this.dividerDragging) return;
    if (event) {
      this.updateDividerDrag(event, cx);
    }
    this.dividerDragging = false;
    this.dividerDragStart = null;
    this.persistDetailsRatio(this.detailsRatio);
    cx.notify();
  }

  renderDetailsDivider(t) {
    const collapsed = Boolean(this.detailsCollapsed);
    const divColors = dividerColors(
      {
        active: !collapsed && this.dividerDragging,
        hovered: !collapsed && this.dividerHovered
      },
      t
    );

    return h_flex()
      .id("beads-details-divider")
      .role("splitter")
      .accessibility_label(
        collapsed
          ? "Issue details pane divider (expand details to resize)"
          : "Resize issue details pane"
      )
      .flex_none()
      .w_full()
      .h(DEFAULT_DIVIDER_HEIGHT)
      .items_center()
      .justify_center()
      .border_t(1)
      .border_color(divColors.color)
      .bg(divColors.bg)
      .when(!collapsed, (el) =>
        el
          .cursor_row_resize()
          .on_hover((hovered, hoverCx) => {
            if (this.dividerHovered !== hovered) {
              this.dividerHovered = hovered;
              hoverCx.notify();
            }
          })
          .on_mouse_down("left", (event, downCx) => {
            this.startDividerDrag(event, downCx);
          })
          .on_mouse_move((event, moveCx) => {
            if (this.dividerDragging) {
              moveCx.stop_propagation();
              this.updateDividerDrag(event, moveCx);
            }
          })
          .on_mouse_up("left", (event, upCx) => {
            if (this.dividerDragging) {
              upCx.stop_propagation();
              this.finishDividerDrag(event, upCx);
            }
          })
          .on_mouse_down_out((_event, outCx) => {
            if (this.dividerDragging) {
              this.finishDividerDrag(null, outCx);
            }
          })
      )
      .child(
        div()
          .w(32)
          .h(2)
          .rounded(1)
          .bg(divColors.color)
      );
  }

  ensureMermaid(source, t, cx) {
    const dark = isDarkColor(t.background);
    const key = mermaidCacheKey(source, { dark });
    const path = `${MOD_CACHE_DIR}/${key}.svg`;

    if (!this.mermaidStates) {
      this.mermaidStates = new Map();
    }
    if (this.mermaidStates.has(key)) {
      return this.mermaidStates.get(key);
    }

    const pendingState = { status: "pending", path };
    this.mermaidStates.set(key, pendingState);

    if (!cx || typeof cx.spawn !== "function") {
      return pendingState;
    }

    cx.spawn(async (asyncCx) => {
      try {
        if (this.closed) return;
        const homeDir = (appHome() || "").replace(/\/+$/, "");
        const cacheDir = `${homeDir}/${MOD_CACHE_DIR}`;
        const absolutePath = `${cacheDir}/${key}.svg`;
        let svgText = null;

        try {
          const existing = await readTextFile(absolutePath);
          if (typeof existing === "string" && existing.trimStart().startsWith("<svg")) {
            svgText = existing;
          }
        } catch {
          // Treat missing or unreadable file as cache miss
        }

        if (this.closed) return;

        if (!svgText) {
          const res = await fetch(mermaidSvgUrl(source, { dark }));
          if (!res.ok) {
            throw new Error("HTTP " + res.status);
          }
          const fetched = await res.text();
          if (typeof fetched !== "string" || !fetched.trimStart().startsWith("<svg")) {
            throw new Error("Unexpected response");
          }
          if (this.closed) return;

          if (!this.mermaidCacheDirReady) {
            try {
              const mkdirFn = fs.promises?.mkdir ?? fs.mkdir;
              if (!homeDir || typeof mkdirFn !== "function") {
                throw new Error("Cache folder unavailable");
              }
              await mkdirFn(cacheDir, { recursive: true });
              this.mermaidCacheDirReady = true;
            } catch {
              throw new Error("Cache folder unavailable");
            }
          }

          try {
            await writeTextFile(absolutePath, fetched, null);
          } catch {
            throw new Error("Cache folder unavailable");
          }

          svgText = fetched;
        }

        if (this.closed) return;

        const maxWidth = Math.max(160, (this.panelWidth || 380) - 56);
        const { width, height } = computeSvgDisplaySize(svgText, maxWidth);
        const viewBox = parseSvgViewBox(svgText);
        const aspectRatio = viewBox
          ? viewBox.width / viewBox.height
          : width > 0 && height > 0
            ? width / height
            : null;
        const intrinsicWidth = viewBox ? viewBox.width : width;

        this.mermaidStates.set(key, {
          status: "ready",
          path,
          width,
          height,
          aspectRatio,
          intrinsicWidth
        });
      } catch (err) {
        if (this.closed) return;
        this.mermaidStates.set(key, {
          status: "error",
          path,
          reason: formatMermaidErrorReason(err)
        });
      }

      try {
        if (!this.closed) {
          asyncCx.notify();
        }
      } catch {
        // Ignore notifications after view close
      }
    });

    return pendingState;
  }

  renderMermaidBlock(source, t, index, cx) {
    const blockId =
      typeof index === "string" && index
        ? index
        : `mermaid-block-${index ?? 0}-${hashString(source)}`;
    const renderSourcePreview = () =>
      div()
        .w_full()
        .min_w(0)
        .p(6)
        .rounded(4)
        .bg(t.raised)
        .font_family("monospace")
        .text_size(this.fs(10))
        .text_color(t.muted)
        .child(source);

    if (!(this.appSettings ?? DEFAULT_SETTINGS).mermaidRender) {
      return v_flex()
        .id(blockId)
        .w_full()
        .min_w(0)
        .p(8)
        .gap(4)
        .rounded(6)
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .child(
          div()
            .font_semibold()
            .text_size(this.fs(10))
            .text_color(t.muted)
            .child("Mermaid rendering is off")
        )
        .child(renderSourcePreview())
        .child(
          div()
            .text_size(this.fs(10))
            .text_color(t.dim)
            .child("Enable it in Settings.")
        );
    }

    this.ensureMermaid(source, t, cx);
    const dark = isDarkColor(t.background);
    const key = mermaidCacheKey(source, { dark });
    const state = this.mermaidStates?.get(key) ?? { status: "pending" };

    if (state.status === "ready" && state.path) {
      const maxWidth = Math.max(160, (this.panelWidth || 380) - 56);
      let displayWidth = state.width || maxWidth;
      let displayHeight = state.height || 180;

      if (
        typeof state.aspectRatio === "number" &&
        Number.isFinite(state.aspectRatio) &&
        state.aspectRatio > 0
      ) {
        const naturalWidth =
          typeof state.intrinsicWidth === "number" &&
          Number.isFinite(state.intrinsicWidth) &&
          state.intrinsicWidth > 0
            ? state.intrinsicWidth
            : displayWidth;
        const lowerBound = Math.min(80, maxWidth);
        const clampedWidth = Math.min(
          Math.max(Math.min(naturalWidth, maxWidth), lowerBound),
          maxWidth
        );
        displayWidth = Math.round(clampedWidth);
        displayHeight = Math.max(1, Math.round(displayWidth / state.aspectRatio));
      }

      return v_flex()
        .id(blockId)
        .flex_none()
        .w_full()
        .min_w(0)
        .items_start()
        .p(6)
        .rounded(6)
        .border_1()
        .border_color(t.border)
        .bg(t.raised)
        .child(image(state.path).w(displayWidth).h(displayHeight));
    }

    if (state.status === "error") {
      return v_flex()
        .id(blockId)
        .w_full()
        .min_w(0)
        .p(8)
        .gap(4)
        .rounded(6)
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .child(
          div()
            .font_semibold()
            .text_size(this.fs(10))
            .text_color(t.muted)
            .child(state.reason || "Network request failed")
        )
        .child(renderSourcePreview());
    }

    return v_flex()
      .id(blockId)
      .w_full()
      .min_w(0)
      .p(8)
      .gap(4)
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.surface)
      .child(
        div()
          .text_size(this.fs(10))
          .text_color(t.muted)
          .child("Rendering diagram…")
      )
      .child(renderSourcePreview());
  }

  renderDetailText({ id, source, t, fallback, cx }) {
    if (typeof source !== "string" || source.trim().length === 0) {
      return div()
        .id(id)
        .w_full()
        .min_w(0)
        .text_size(this.fs(11))
        .text_color(t.muted)
        .child(fallback);
    }

    if ((this.appSettings ?? DEFAULT_SETTINGS).detailsRender === "raw") {
      return div()
        .id(id)
        .w_full()
        .min_w(0)
        .text_size(this.fs(11))
        .text_color(t.foreground)
        .child(source);
    }

    if (!hasMermaidBlocks(source)) {
      return TextView.markdown(id, source)
        .w_full()
        .min_w(0)
        .text_size(this.fs(11))
        .text_color(t.foreground);
    }

    const segments = splitMermaidBlocks(source);
    return v_flex()
      .id(id)
      .w_full()
      .min_w(0)
      .gap(6)
      .children(
        segments.map((segment, index) => {
          if (segment.type === "mermaid") {
            return this.renderMermaidBlock(segment.text, t, `${id}-mermaid-${index}`, cx);
          }
          return TextView.markdown(`${id}-md-${index}`, segment.text)
            .w_full()
            .min_w(0)
            .text_size(this.fs(11))
            .text_color(t.foreground);
        })
      );
  }

  renderDetailsScrollContent(scrollId, t, cx) {
    const issue = this.selectedIssue;
    const errColors = errorColors(t);

    return v_flex()
      .id(scrollId)
      .flex_1()
      .min_h(0)
      .w_full()
      .min_w(0)
      .overflow_y_scrollbar()
      .p(12)
      .gap(8)
      .when(this.detailState === "idle", (el) =>
        el.child(
          div()
            .text_size(this.fs(12))
            .text_color(t.dim)
            .child("Select an issue or press Enter on the highlighted row to inspect details and dependencies.")
        )
      )
      .when(this.detailState === "loading", (el) =>
        el.child(
          div()
            .text_size(this.fs(12))
            .text_color(t.muted)
            .child(`Loading details for ${this.selectedId}…`)
        )
      )
      .when(this.detailState === "error", (el) =>
        el.child(
          div()
            .w_full()
            .p(8)
            .rounded(6)
            .border_1()
            .border_color(errColors.border)
            .bg(errColors.bg)
            .text_size(this.fs(11))
            .text_color(errColors.text)
            .child(this.detailError || "Failed to load issue details.")
        )
      )
      .when(this.detailState === "ready" && Boolean(issue), (el) =>
        el
          .child(
            div()
              .w_full()
              .min_w(0)
              .font_semibold()
              .text_size(this.fs(13))
              .text_color(t.foreground)
              .child(issue.title || "Untitled issue")
          )
          .child(
            h_flex()
              .w_full()
              .flex_wrap()
              .gap(6)
              .items_center()
              .child(this.renderPill(`P${issue.priority}`, priorityPillColors(issue.priority, t), true))
              .child(this.renderPill(issue.issueType, typePillColors(issue.issueType, t)))
              .child(this.renderPill(issue.status, statusPillColors(issue.status, t)))
              .when(this.readyIds.has(issue.id), (row) =>
                row.child(this.renderPill("ready", statusPillColors("ready", t), true))
              )
              .child(
                div()
                  .text_size(this.fs(11))
                  .text_color(t.muted)
                  .child(`Assignee: ${issue.assignee || "Unassigned"}`)
              )
          )
          .child(
            h_flex()
              .w_full()
              .flex_wrap()
              .gap(4)
              .items_center()
              .child(div().text_size(this.fs(11)).text_color(t.dim).child("Labels:"))
              .when(issue.labels.length === 0, (row) =>
                row.child(div().text_size(this.fs(11)).text_color(t.dim).child("No labels"))
              )
              .when(issue.labels.length > 0, (row) =>
                row.children(
                  issue.labels.map((label) =>
                    div()
                      .px(5)
                      .py(1)
                      .rounded(999)
                      .border_1()
                      .border_color(t.border)
                      .bg(t.raised)
                      .text_size(this.fs(10))
                      .text_color(t.foreground)
                      .child(label)
                  )
                )
              )
          )
          .child(
            v_flex()
              .w_full()
              .min_w(0)
              .gap(2)
              .child(div().font_semibold().text_size(this.fs(11)).text_color(t.dim).child("Description"))
              .child(
                this.renderDetailText({
                  id: `${scrollId}-description`,
                  source: issue.description,
                  t,
                  fallback: "No description provided.",
                  cx
                })
              )
          )
          .child(
            v_flex()
              .w_full()
              .min_w(0)
              .gap(2)
              .child(div().font_semibold().text_size(this.fs(11)).text_color(t.dim).child("Acceptance Criteria"))
              .child(
                this.renderDetailText({
                  id: `${scrollId}-acceptance`,
                  source: issue.acceptanceCriteria,
                  t,
                  fallback: "No acceptance criteria.",
                  cx
                })
              )
          )
          .child(
            v_flex()
              .w_full()
              .min_w(0)
              .gap(4)
              .child(
                div()
                  .font_semibold()
                  .text_size(this.fs(11))
                  .text_color(t.dim)
                  .child(`Direct Dependencies (${this.selectedDeps.length})`)
              )
              .when(this.selectedDeps.length === 0, (depCol) =>
                depCol.child(
                  div().text_size(this.fs(11)).text_color(t.dim).child("No direct dependencies.")
                )
              )
              .when(this.selectedDeps.length > 0, (depCol) =>
                depCol.children(
                  this.selectedDeps.map((dep, index) => {
                    const canNavigateDep = Boolean(dep.id);
                    const depTypePill = dep.type ? typePillColors(dep.type, t) : null;
                    const depStatusPill = statusPillColors(dep.status, t);
                    return h_flex()
                      .id(`dep-${dep.id || index}`)
                      .w_full()
                      .min_w(0)
                      .px(6)
                      .py(4)
                      .gap(6)
                      .rounded(4)
                      .bg(t.raised)
                      .items_center()
                      .justify_between()
                      .when(canNavigateDep, (row) =>
                        row
                          .cursor_pointer()
                          .hover((s) => s.bg(t.hover))
                          .on_click((_e, depCx) => {
                            this.handle.focus();
                            this.selectIssue(dep.id, depCx);
                          })
                      )
                      .child(
                        h_flex()
                          .flex_1()
                          .min_w(0)
                          .items_center()
                          .gap(6)
                          .child(
                            div()
                              .flex_none()
                              .font_semibold()
                              .text_size(this.fs(10))
                              .text_color(t.muted)
                              .child(dep.id || "unknown")
                          )
                          .child(
                            div()
                              .flex_1()
                              .min_w(0)
                              .truncate()
                              .text_size(this.fs(11))
                              .text_color(t.foreground)
                              .child(dep.title || "Untitled dependency")
                          )
                      )
                      .child(
                        h_flex()
                          .flex_none()
                          .items_center()
                          .gap(4)
                          .when(Boolean(depTypePill), (row) =>
                            row.child(this.renderPill(dep.type, depTypePill))
                          )
                          .child(this.renderPill(dep.status, depStatusPill))
                      );
                  })
                )
              )
          )
      );
  }

  renderDetailsSection(detailsLayout, t, cx) {
    const collapsed = Boolean(this.detailsCollapsed);
    const divider = dividerColors({}, t);
    const popupBtnColors = controlColors(
      {
        mutedWhenInactive: true,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const toggleBtnColors = controlColors(
      {
        mutedWhenInactive: true,
        variant: this.appSettings.buttonVariant
      },
      t
    );
    const showOpenDetailPopup =
      this.canOpenDetailPopup(this.currentContext) &&
      Boolean(this.selectedId && this.detailState === "ready" && this.selectedIssue);
    const headerChevron = collapsed ? "▸" : "▾";
    const toggleLabel = collapsed ? "▸ Expand (d)" : "▾ Collapse (d)";
    const toggleTooltip = collapsed ? "Expand issue details (d)" : "Collapse issue details (d)";

    return v_flex()
      .id("beads-details-pane")
      .flex_none()
      .when(!collapsed, (el) => el.h(detailsLayout.detailsHeight))
      .w_full()
      .min_w(0)
      .bg(t.surface)
      .child(
        h_flex()
          .id("beads-details-header")
          .flex_none()
          .px(12)
          .py(7)
          .items_center()
          .justify_between()
          .gap(6)
          .when(!collapsed, (el) => el.border_b(1).border_color(divider.color))
          .child(
            h_flex()
              .id("beads-details-header-title")
              .min_w(0)
              .items_center()
              .gap(5)
              .cursor_pointer()
              .on_click((_e, clickCx) => {
                this.handle.focus();
                this.toggleDetailsCollapsed(clickCx);
              })
              .child(
                div()
                  .flex_none()
                  .text_size(this.fs(11))
                  .text_color(t.muted)
                  .child(headerChevron)
              )
              .child(
                div()
                  .font_semibold()
                  .truncate()
                  .text_size(this.fs(11))
                  .text_color(t.muted)
                  .child(this.selectedId ? `Details · ${this.selectedId}` : "Issue Details")
              )
          )
          .child(
            h_flex()
              .items_center()
              .gap(6)
              .when(Boolean(this.highlightedId && this.highlightedId !== this.selectedId), (el) =>
                el.child(
                  div()
                    .text_size(this.fs(10))
                    .text_color(t.dim)
                    .child(`Press Enter to load ${this.highlightedId}`)
                )
              )
              .when(showOpenDetailPopup, (el) =>
                el.child(
                  div()
                    .id("beads-open-detail-popup")
                    .px(6)
                    .py(2)
                    .rounded(4)
                    .border_1()
                    .border_color(popupBtnColors.border)
                    .bg(popupBtnColors.bg)
                    .text_size(this.fs(10))
                    .text_color(popupBtnColors.text)
                    .cursor_pointer()
                    .hover((s) => s.bg(popupBtnColors.hoverBg))
                    .on_click((_e, clickCx) => {
                      this.handle.focus();
                      this.openIssueDetailPopup(this.selectedId, clickCx);
                    })
                    .child("Open in popup")
                )
              )
              .child(
                div()
                  .id("beads-details-toggle")
                  .role("button")
                  .accessibility_label(toggleTooltip)
                  .tooltip(toggleTooltip)
                  .px(6)
                  .py(2)
                  .rounded(4)
                  .border_1()
                  .border_color(toggleBtnColors.border)
                  .bg(toggleBtnColors.bg)
                  .text_size(this.fs(10))
                  .text_color(toggleBtnColors.text)
                  .cursor_pointer()
                  .hover((s) => s.bg(toggleBtnColors.hoverBg))
                  .on_key_down((event, keyCx) => {
                    const key = (event.key || "").toLowerCase();
                    if (key === "enter" || key === " " || key === "space") {
                      keyCx.stop_propagation();
                      this.toggleDetailsCollapsed(keyCx);
                    }
                  })
                  .on_click((_e, clickCx) => {
                    this.handle.focus();
                    this.toggleDetailsCollapsed(clickCx);
                  })
                  .child(toggleLabel)
              )
          )
      )
      .when(!collapsed, (el) =>
        el.child(this.renderDetailsScrollContent("beads-details-scroll", t, cx))
      );
  }

  renderDetailPopupView(t, cx) {
    return v_flex()
      .id("beads-detail-popup-view")
      .flex_1()
      .min_h(0)
      .w_full()
      .min_w(0)
      .bg(t.surface)
      .child(this.renderDetailsScrollContent("beads-detail-popup-scroll", t, cx));
  }

  render(cx) {
    this.syncSettings();
    const context = this.syncContext(cx);
    const rawTheme = theme();
    const t = { ...rawTheme, ...resolveThemeTokens(rawTheme) };
    const errColors = errorColors(t);
    const visible = this.visibleIssues();
    const isDetailPopup = this.popupMode === "detail";
    const showFunctionalUi =
      context.supported &&
      (isDetailPopup || this.listState === "ready" || this.listState === "empty");
    const detailsLayout = this.currentDetailsLayout();

    if (!this.isOverlay && !this.blockId) {
      this.blockId = this.findOwnLayoutBlock(layout())?.id ?? null;
    }

    return v_flex()
      .id("beads-desktop")
      .size_full()
      .min_h(0)
      .min_w(0)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(this.fs(12))
      .track_focus(this.handle)
      .on_size_change((size, sizeCx) => this.handlePanelSizeChange(size, sizeCx))
      .on_mouse_move((event, moveCx) => {
        if (this.dividerDragging) {
          this.updateDividerDrag(event, moveCx);
        }
      })
      .on_mouse_up("left", (event, upCx) => {
        if (this.dividerDragging) {
          this.finishDividerDrag(event, upCx);
        }
      })
      .on_key_down((e, keyCx) => this.handleKeyDown(e, keyCx))
      .child(this.renderHeader(context, visible.length, t))
      .when(this.showSettings, (el) => el.child(this.renderSettingsView(t)))
      .when(!this.showSettings && (this.isOverlay || !this.blockId) && !context.supported, (el) =>
        el.child(
          v_flex()
            .flex_1()
            .w_full()
            .p(14)
            .gap(6)
            .child(div().font_semibold().text_size(this.fs(13)).text_color(t.foreground).child("Unsupported Space Context"))
            .child(div().text_size(this.fs(12)).text_color(t.muted).child(context.reason))
        )
      )
      .when(!this.showSettings && (this.isOverlay || !this.blockId) && context.supported && !showFunctionalUi && this.listState !== "loading", (el) =>
        el.child(
          v_flex()
            .flex_1()
            .w_full()
            .p(14)
            .gap(6)
            .child(div().font_semibold().text_size(this.fs(13)).text_color(t.foreground).child("Beads Unavailable"))
            .child(
              div()
                .text_size(this.fs(12))
                .text_color(errColors.text)
                .child(this.listError || "Unable to read this Beads project. Check that br is installed and the project is initialized.")
            )
        )
      )
      .when(!this.showSettings && !isDetailPopup && context.supported && this.listState === "loading", (el) =>
        el.child(
          v_flex()
            .flex_1()
            .w_full()
            .p(14)
            .gap(6)
            .child(div().font_semibold().text_size(this.fs(13)).text_color(t.foreground).child("Loading"))
            .child(div().text_size(this.fs(12)).text_color(t.muted).child("Loading issues from br…"))
        )
      )
      .when(!this.showSettings && showFunctionalUi && isDetailPopup, (el) =>
        el.child(this.renderDetailPopupView(t, cx))
      )
      .when(!this.showSettings && showFunctionalUi && !isDetailPopup, (el) =>
        el
          .child(this.renderControls(context, t))
          .when(this.bvAvailable && this.bvState !== "idle", (panel) => panel.child(this.renderBvSection(t)))
          .child(this.renderIssueList(visible, t))
          .child(this.renderDetailsDivider(t))
          .child(this.renderDetailsSection(detailsLayout, t, cx))
      );
  }
}
