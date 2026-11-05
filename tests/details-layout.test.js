import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DETAILS_RATIO,
  MIN_DETAILS_RATIO,
  MAX_DETAILS_RATIO,
  MIN_DETAILS_HEIGHT,
  MIN_LIST_HEIGHT,
  DEFAULT_DIVIDER_HEIGHT,
  DEFAULT_COLLAPSED_DETAILS_HEIGHT,
  DEFAULT_PANEL_HEIGHT,
  DETAILS_RATIO_STORAGE_KEY,
  normalizeDetailsRatio,
  parseDetailsRatio,
  serializeDetailsRatio,
  getDetailsRatioBounds,
  clampDetailsRatio,
  computeDetailsHeight,
  computeDetailsLayout,
  pointerToDetailsRatio,
  dragDeltaToDetailsRatio,
  resolveDividerDrag,
  sizesToDetailsRatio,
  loadDetailsRatio,
  saveDetailsRatio,
  computePopupLayout,
  projectKeyForContext,
  loadProjectDetailsLayout,
  saveProjectDetailsLayout
} from "../mods/beads-desktop/details-layout.js";

test("normalizeDetailsRatio parses valid ratios and falls back on invalid inputs", () => {
  assert.equal(normalizeDetailsRatio(0.42), 0.42);
  assert.equal(parseDetailsRatio("0.45"), 0.45);
  assert.equal(normalizeDetailsRatio(" 0.33333 "), 0.3333);

  assert.equal(normalizeDetailsRatio(null), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(undefined), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(""), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio("not-a-number"), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(NaN), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(Infinity), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(0), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(-0.3), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(1), DEFAULT_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(230), DEFAULT_DETAILS_RATIO);
});

test("normalizeDetailsRatio clamps extreme in-unit ratios and serializeDetailsRatio formats cleanly", () => {
  assert.equal(normalizeDetailsRatio(0.05), MIN_DETAILS_RATIO);
  assert.equal(normalizeDetailsRatio(0.95), MAX_DETAILS_RATIO);
  assert.equal(serializeDetailsRatio(0.38456), "0.3846");
});

test("clampDetailsRatio respects global ratio bounds on spacious panels", () => {
  const panelHeight = 800;

  assert.equal(clampDetailsRatio(0.4, { panelHeight }), 0.4);
  assert.equal(clampDetailsRatio(0.05, { panelHeight }), MIN_DETAILS_RATIO);
  assert.equal(clampDetailsRatio(0.9, { panelHeight }), MAX_DETAILS_RATIO);
  assert.equal(clampDetailsRatio(-0.2, { panelHeight }), MIN_DETAILS_RATIO);
  assert.equal(clampDetailsRatio(1.4, { panelHeight }), MAX_DETAILS_RATIO);
});

test("clampDetailsRatio tightens bounds on medium/non-maximized panels to preserve min list and details heights", () => {
  const panelHeight = 360;
  const minDetailsHeight = 120;
  const minListHeight = 150;
  const chromeHeight = 30;

  const bounds = getDetailsRatioBounds({
    panelHeight,
    minDetailsHeight,
    minListHeight,
    chromeHeight
  });

  // Details needs at least 120px (120 / 360 = 0.3333...)
  // List + chrome needs at least 150 + 30 = 180px, so details can be at most 180px (180 / 360 = 0.5)
  assert.equal(bounds.minDetailsHeight, 120);
  assert.equal(bounds.maxDetailsHeight, 180);
  assert.equal(bounds.isCompact, false);

  const clampedLow = clampDetailsRatio(0.2, {
    panelHeight,
    minDetailsHeight,
    minListHeight,
    chromeHeight
  });
  const clampedHigh = clampDetailsRatio(0.7, {
    panelHeight,
    minDetailsHeight,
    minListHeight,
    chromeHeight
  });

  assert.ok(Math.abs(clampedLow - 120 / 360) < 0.001);
  assert.ok(Math.abs(clampedHigh - 180 / 360) < 0.001);
});

test("tiny panels scale bounds gracefully so minRatio <= maxRatio and both list and details stay usable", () => {
  const panelHeight = 180;
  const layout = computeDetailsLayout({
    panelHeight,
    ratio: 0.85,
    minDetailsHeight: MIN_DETAILS_HEIGHT,
    minListHeight: MIN_LIST_HEIGHT
  });

  assert.equal(layout.isCompact, true);
  assert.ok(layout.minRatio <= layout.maxRatio);
  assert.ok(layout.minDetailsHeight <= layout.maxDetailsHeight);
  assert.ok(layout.detailsHeight >= 50, `expected detailsHeight >= 50, got ${layout.detailsHeight}`);
  assert.ok(layout.listHeight >= 70, `expected listHeight >= 70, got ${layout.listHeight}`);
  assert.equal(layout.detailsHeight + layout.listHeight, panelHeight);
});

test("computeDetailsHeight scales proportionally across monitor resolutions and preserves stored ratio after compact resize", () => {
  const userRatio = 0.45;

  // Compact non-maximized window clamps pixel height so list is not starved
  const compactLayout = computeDetailsLayout({
    panelHeight: 220,
    ratio: userRatio
  });
  assert.equal(compactLayout.ratio, userRatio);
  assert.ok(compactLayout.detailsHeight < Math.round(220 * userRatio) || compactLayout.listHeight >= 90);

  // Expanding to standard 700px panel and 1200px high-DPI/tall monitor restores exact userRatio proportion
  const standardHeight = computeDetailsHeight({ panelHeight: 700, ratio: compactLayout.ratio });
  const tallHeight = computeDetailsHeight({ panelHeight: 1200, ratio: compactLayout.ratio });

  assert.equal(standardHeight, Math.round(700 * userRatio));
  assert.equal(tallHeight, Math.round(1200 * userRatio));
});

test("computeDetailsHeight uses fallback panel height before initial on_size_change measurement", () => {
  const height = computeDetailsHeight({ panelHeight: null, ratio: DEFAULT_DETAILS_RATIO });
  assert.equal(height, Math.round(DEFAULT_PANEL_HEIGHT * DEFAULT_DETAILS_RATIO));

  const zeroHeight = computeDetailsHeight(0, DEFAULT_DETAILS_RATIO);
  assert.equal(zeroHeight, Math.round(DEFAULT_PANEL_HEIGHT * DEFAULT_DETAILS_RATIO));
});

test("pointerToDetailsRatio converts divider pointer Y within panel bounds into a clamped ratio", () => {
  // Panel from y=100 to y=700 (height=600)
  // Pointer at y=460 -> 240px from bottom -> ratio = 240 / 600 = 0.4
  const ratio = pointerToDetailsRatio({
    pointerY: 460,
    panelTop: 100,
    panelHeight: 600
  });
  assert.equal(ratio, 0.4);

  // Dragging pointer above top of panel clamps to maxRatio
  const draggedTooHigh = pointerToDetailsRatio({
    pointerY: 50,
    panelTop: 100,
    panelHeight: 600
  });
  assert.equal(draggedTooHigh, MAX_DETAILS_RATIO);

  // Dragging pointer below bottom of panel clamps to minRatio
  const draggedTooLow = pointerToDetailsRatio({
    pointerY: 750,
    panelTop: 100,
    panelHeight: 600
  });
  assert.equal(draggedTooLow, MIN_DETAILS_RATIO);
});

test("dragDeltaToDetailsRatio and resolveDividerDrag support delta dragging from startY", () => {
  // Starting at ratio 0.4 on a 500px panel (200px details):
  // Dragging UP by 50px (deltaY = -50, pointerY = 250 from startY = 300) -> 250px details -> ratio 0.5
  const upRatio = dragDeltaToDetailsRatio({
    deltaY: -50,
    panelHeight: 500,
    startRatio: 0.4
  });
  assert.equal(upRatio, 0.5);

  // Dragging DOWN by 50px (deltaY = +50) -> 150px details -> ratio 0.3
  const downRatio = dragDeltaToDetailsRatio({
    deltaY: 50,
    panelHeight: 500,
    startRatio: 0.4
  });
  assert.equal(downRatio, 0.3);

  const dragResult = resolveDividerDrag({
    pointerY: 250,
    startY: 300,
    startRatio: 0.4,
    currentRatio: 0.4,
    panelHeight: 500,
    dividerHeight: DEFAULT_DIVIDER_HEIGHT
  });
  assert.equal(dragResult.ratio, 0.5);
  assert.equal(dragResult.detailsHeight, 250);
  assert.equal(dragResult.listHeight, 500 - DEFAULT_DIVIDER_HEIGHT - 250);
  assert.equal(dragResult.changed, true);
});

test("sizesToDetailsRatio converts resizable panel sizes into a clamped panel ratio", () => {
  const ratio = sizesToDetailsRatio([360, 240], { panelHeight: 600 });
  assert.equal(ratio, 0.4);

  const inferredPanelRatio = sizesToDetailsRatio([300, 200]);
  assert.equal(inferredPanelRatio, 0.4);
});

test("loadDetailsRatio and saveDetailsRatio persist and restore ratio safely with storage adapters", () => {
  const store = new Map();
  const mockStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    }
  };

  assert.equal(loadDetailsRatio({ storage: mockStorage }), DEFAULT_DETAILS_RATIO);

  const saved = saveDetailsRatio(0.47, { storage: mockStorage });
  assert.equal(saved.persisted, true);
  assert.equal(saved.ratio, 0.47);
  assert.equal(store.get(DETAILS_RATIO_STORAGE_KEY), "0.47");

  const restored = loadDetailsRatio({ storage: mockStorage });
  assert.equal(restored, 0.47);

  // Broken storage never throws and falls back to fallbackStorage ({ get, set } adapter)
  const sharedMap = new Map();
  const fallbackAdapter = {
    get(key) {
      return sharedMap.get(key) ?? null;
    },
    set(key, value) {
      sharedMap.set(key, value);
    }
  };
  const brokenStorage = {
    getItem() {
      throw new Error("storage denied");
    },
    setItem() {
      throw new Error("storage denied");
    }
  };
  assert.equal(
    loadDetailsRatio({ storage: brokenStorage, fallbackStorage: fallbackAdapter }),
    DEFAULT_DETAILS_RATIO
  );
  const fallbackSave = saveDetailsRatio(0.5, {
    storage: brokenStorage,
    fallbackStorage: fallbackAdapter
  });
  assert.equal(fallbackSave.persisted, true);
  assert.equal(fallbackSave.ratio, 0.5);
  assert.equal(
    loadDetailsRatio({ storage: brokenStorage, fallbackStorage: fallbackAdapter }),
    0.5
  );
});

test("divider drag with chromeHeight and dividerHeight stops before starving the issue list", () => {
  // Panel height 600, chrome 94, divider 6 => available 500.
  // With minListHeight 140, details can be at most 360px (ratio 0.6).
  const clampedRatio = pointerToDetailsRatio({
    pointerY: 200,
    panelTop: 100,
    panelHeight: 600,
    chromeHeight: 94,
    dividerHeight: 6,
    minListHeight: 140
  });
  assert.equal(clampedRatio, 0.6);

  const layout = computeDetailsLayout({
    panelHeight: 600,
    ratio: clampedRatio,
    chromeHeight: 94,
    dividerHeight: 6,
    minListHeight: 140
  });
  assert.equal(layout.detailsHeight, 360);
  assert.equal(layout.listHeight, 140);
});

test("computePopupLayout produces responsive dimensions for detail and full-mod popups across window sizes", () => {
  const smallWindowPopup = computePopupLayout({
    viewportWidth: 640,
    viewportHeight: 420,
    mode: "board",
    detailsRatio: 0.4
  });

  assert.ok(smallWindowPopup.width <= 640 - 32);
  assert.ok(smallWindowPopup.height <= 420 - 32);
  assert.ok(smallWindowPopup.detailsLayout.detailsHeight > 0);
  assert.ok(smallWindowPopup.detailsLayout.listHeight > 0);

  const detailPopup = computePopupLayout({
    viewportWidth: 1440,
    viewportHeight: 900,
    mode: "detail"
  });
  assert.ok(detailPopup.width >= 420 && detailPopup.width <= 960);
  assert.ok(detailPopup.height >= 300 && detailPopup.height <= 760);
  assert.ok(detailPopup.bodyHeight > 200);
});

test("projectKeyForContext shares one key across tabs of the same project and separates distinct projects", () => {
  const tabA = {
    key: "local:space-1:tab-a::/projects/alpha",
    machine: null,
    spaceId: "space-1",
    tabId: "tab-a",
    cwd: "/projects/alpha"
  };
  const tabB = {
    key: "local:space-1:tab-b::/projects/alpha",
    machine: null,
    spaceId: "space-1",
    tabId: "tab-b",
    cwd: "/projects/alpha/"
  };
  const otherProject = {
    key: "local:space-1:tab-c::/projects/beta",
    machine: null,
    spaceId: "space-1",
    tabId: "tab-c",
    cwd: "/projects/beta"
  };
  const remoteProject = {
    key: "remote:space-1:tab-a:devbox:/projects/alpha",
    machine: "devbox",
    spaceId: "space-1",
    tabId: "tab-a",
    cwd: "/projects/alpha"
  };

  assert.equal(projectKeyForContext(tabA), projectKeyForContext(tabB));
  assert.equal(projectKeyForContext(tabA), "local|space-1|/projects/alpha");
  assert.notEqual(projectKeyForContext(tabA), projectKeyForContext(otherProject));
  assert.notEqual(projectKeyForContext(tabA), projectKeyForContext(remoteProject));
});

test("per-project layout migrates from legacy global ratio, stored project value always wins, and tabs share state", () => {
  const store = new Map();
  const storage = {
    get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    set(key, value) {
      store.set(key, String(value));
    }
  };

  // Seed legacy global ratio
  store.set(DETAILS_RATIO_STORAGE_KEY, "0.52");

  const projectATab1 = { machine: null, spaceId: "ws-1", tabId: "tab-1", cwd: "/repo/a" };
  const projectATab2 = { machine: null, spaceId: "ws-1", tabId: "tab-2", cwd: "/repo/a" };
  const projectB = { machine: null, spaceId: "ws-1", tabId: "tab-3", cwd: "/repo/b" };

  // Project A has no stored ratio yet -> falls back to legacy global 0.52, collapsed defaults to false
  const initialA = loadProjectDetailsLayout({ context: projectATab1, storage });
  assert.equal(initialA.detailRatio, 0.52);
  assert.equal(initialA.detailsCollapsed, false);
  assert.equal(initialA.hasStoredRatio, false);

  // User resizes Project A in tab 1 to 0.31
  const savedA = saveProjectDetailsLayout(
    { detailRatio: 0.31 },
    { context: projectATab1, storage, panelHeight: 600, chromeHeight: 96, dividerHeight: 6 }
  );
  assert.equal(savedA.persisted, true);
  assert.equal(savedA.detailRatio, 0.31);

  // Switching to tab 2 of Project A keeps the shared 0.31 ratio
  const tab2A = loadProjectDetailsLayout({ context: projectATab2, storage });
  assert.equal(tab2A.detailRatio, 0.31);
  assert.equal(tab2A.hasStoredRatio, true);

  // Even if legacy global ratio changes or is present, Project A's stored ratio always wins
  store.set(DETAILS_RATIO_STORAGE_KEY, "0.64");
  assert.equal(loadProjectDetailsLayout({ context: projectATab1, storage }).detailRatio, 0.31);

  // Switching to Project B (no stored project ratio) falls back to the legacy global ratio
  const initialB = loadProjectDetailsLayout({ context: projectB, storage });
  assert.equal(initialB.detailRatio, 0.64);
  assert.equal(initialB.detailsCollapsed, false);

  // Collapsing details in Project B persists per project without affecting Project A
  saveProjectDetailsLayout({ detailsCollapsed: true }, { context: projectB, storage });
  const reloadedB = loadProjectDetailsLayout({ context: projectB, storage });
  assert.equal(reloadedB.detailsCollapsed, true);
  assert.equal(reloadedB.detailRatio, 0.64);

  const reloadedA = loadProjectDetailsLayout({ context: projectATab1, storage });
  assert.equal(reloadedA.detailsCollapsed, false);
  assert.equal(reloadedA.detailRatio, 0.31);
});

test("collapsing details expands list height to remaining space, preserves stored ratio, and disables divider drag", () => {
  const expanded = computeDetailsLayout({
    panelHeight: 600,
    ratio: 0.45,
    chromeHeight: 96,
    dividerHeight: 6,
    collapsed: false
  });
  const collapsed = computeDetailsLayout({
    panelHeight: 600,
    ratio: 0.45,
    chromeHeight: 96,
    dividerHeight: 6,
    collapsed: true
  });

  assert.equal(expanded.collapsed, false);
  assert.equal(collapsed.collapsed, true);
  assert.equal(collapsed.detailsHeight, DEFAULT_COLLAPSED_DETAILS_HEIGHT);
  assert.equal(collapsed.listHeight, collapsed.availableHeight - DEFAULT_COLLAPSED_DETAILS_HEIGHT);
  assert.ok(collapsed.listHeight > expanded.listHeight);
  // Stored ratio is preserved so reopening restores the same height
  assert.equal(collapsed.ratio, 0.45);

  const reopened = computeDetailsLayout({
    panelHeight: 600,
    ratio: collapsed.ratio,
    chromeHeight: 96,
    dividerHeight: 6,
    collapsed: false
  });
  assert.equal(reopened.detailsHeight, expanded.detailsHeight);

  // Divider drag while collapsed is a no-op
  const dragWhileCollapsed = resolveDividerDrag({
    pointerY: 180,
    startY: 350,
    startRatio: 0.45,
    currentRatio: 0.45,
    panelHeight: 600,
    chromeHeight: 96,
    dividerHeight: 6,
    collapsed: true
  });
  assert.equal(dragWhileCollapsed.changed, false);
  assert.equal(dragWhileCollapsed.ratio, 0.45);
  assert.equal(dragWhileCollapsed.collapsed, true);
  assert.equal(dragWhileCollapsed.detailsHeight, DEFAULT_COLLAPSED_DETAILS_HEIGHT);
});

test("computeDetailsLayout handles a compact panel", () => {
  const layout = computeDetailsLayout({ panelHeight: 120, ratio: 0.4, minDetailsHeight: 108, minListHeight: 140 });
  assert.equal(layout.isCompact, true);
  assert.ok(layout.detailsHeight >= 1);
  assert.ok(layout.listHeight >= 0);
});

test("computeDetailsLayout handles a zero available height", () => {
  const layout = computeDetailsLayout({ panelHeight: 10, ratio: 0.4, minDetailsHeight: 108, minListHeight: 140 });
  assert.equal(layout.isCompact, true);
});

test("sizesToDetailsRatio falls back when sizes are missing", () => {
  assert.equal(sizesToDetailsRatio([], {}), DEFAULT_DETAILS_RATIO);
  assert.equal(sizesToDetailsRatio([100], {}), DEFAULT_DETAILS_RATIO);
});

test("sizesToDetailsRatio computes from two sizes", () => {
  const ratio = sizesToDetailsRatio([200, 300], {});
  assert.ok(ratio > 0 && ratio < 1);
});

test("dragDeltaToDetailsRatio returns a clamped ratio", () => {
  const ratio = dragDeltaToDetailsRatio({ deltaY: 50, panelHeight: 600, startRatio: 0.38 });
  assert.ok(ratio >= MIN_DETAILS_RATIO && ratio <= MAX_DETAILS_RATIO);
});

test("pointerToDetailsRatio returns a clamped ratio", () => {
  const ratio = pointerToDetailsRatio({ pointerY: 300, panelHeight: 600, panelTop: 0 });
  assert.ok(ratio >= MIN_DETAILS_RATIO && ratio <= MAX_DETAILS_RATIO);
});

test("loadDetailsRatio reads from a storage shim", () => {
  const store = { getItem: (k) => "0.5", setItem: () => {} };
  const ratio = loadDetailsRatio({ storage: store, key: "k", fallbackRatio: 0.38 });
  assert.equal(ratio, 0.5);
});

test("loadDetailsRatio falls back when storage is missing", () => {
  const ratio = loadDetailsRatio({ storage: null, fallbackRatio: 0.38 });
  assert.equal(ratio, 0.38);
});

test("saveDetailsRatio persists to a storage shim", () => {
  const store = { setItem: () => {}, getItem: () => null };
  const result = saveDetailsRatio(0.4, { storage: store, key: "k", panelHeight: 600 });
  assert.equal(result.persisted, true);
  assert.ok(result.ratio > 0);
});

test("saveDetailsRatio reports not persisted when storage is missing", () => {
  const result = saveDetailsRatio(0.4, { storage: null, key: "k" });
  assert.equal(result.persisted, false);
});

test("resolveDividerDrag reports changed only when the ratio moves", () => {
  const result = resolveDividerDrag({ panelHeight: 600, pointerY: 300, currentRatio: 0.38 });
  assert.equal(typeof result.changed, "boolean");
  assert.ok(result.ratio > 0);
});
