import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveThemeTokens,
  priorityColor,
  priorityBadgeColors,
  priorityPillColors,
  typeColor,
  typePillColors,
  statusColor,
  statusPillColors,
  isKnownStatus,
  statusBorderColor,
  rowColors,
  controlColors,
  errorColors,
  readyBadgeColors,
  dividerColors,
  isDarkColor,
  parseHexColor,
  relativeLuminance,
  contrastRatio,
  pickReadableColor,
  mixHexColors,
  shiftForReadability
} from "../mods/beads-desktop/theme.js";

const DARK_THEME = Object.freeze({
  background: "tok:dark:bg",
  surface: "tok:dark:surface",
  canvas: "tok:dark:canvas",
  chrome: "tok:dark:chrome",
  popover: "tok:dark:popover",
  raised: "tok:dark:raised",
  hover: "tok:dark:hover",
  selected: "tok:dark:selected",
  selection: "tok:dark:selection",
  border: "tok:dark:border",
  input: "tok:dark:input",
  foreground: "tok:dark:fg",
  muted: "tok:dark:muted",
  dim: "tok:dark:dim",
  accent: "tok:dark:accent",
  accent_foreground: "tok:dark:accent_fg",
  solid: "tok:dark:solid",
  solid_foreground: "tok:dark:solid_fg",
  working: "tok:dark:working",
  blocked: "tok:dark:blocked",
  done: "tok:dark:done",
  idle: "tok:dark:idle",
  unknown: "tok:dark:unknown",
  ansi1: "tok:dark:ansi1",
  ansi2: "tok:dark:ansi2",
  ansi3: "tok:dark:ansi3",
  ansi4: "tok:dark:ansi4",
  ansi6: "tok:dark:ansi6",
  ansi8: "tok:dark:ansi8"
});

const LIGHT_THEME = Object.freeze({
  background: "tok:light:bg",
  surface: "tok:light:surface",
  canvas: "tok:light:canvas",
  chrome: "tok:light:chrome",
  popover: "tok:light:popover",
  raised: "tok:light:raised",
  hover: "tok:light:hover",
  selected: "tok:light:selected",
  selection: "tok:light:selection",
  border: "tok:light:border",
  input: "tok:light:input",
  foreground: "tok:light:fg",
  muted: "tok:light:muted",
  dim: "tok:light:dim",
  accent: "tok:light:accent",
  accent_foreground: "tok:light:accent_fg",
  solid: "tok:light:solid",
  solid_foreground: "tok:light:solid_fg",
  working: "tok:light:working",
  blocked: "tok:light:blocked",
  done: "tok:light:done",
  idle: "tok:light:idle",
  unknown: "tok:light:unknown",
  ansi1: "tok:light:ansi1",
  ansi2: "tok:light:ansi2",
  ansi3: "tok:light:ansi3",
  ansi4: "tok:light:ansi4",
  ansi6: "tok:light:ansi6",
  ansi8: "tok:light:ansi8"
});

function assertFromTheme(value, themeObj) {
  const allowed = new Set(Object.values(themeObj));
  assert.equal(
    allowed.has(value),
    true,
    `Expected "${value}" to come strictly from theme tokens`
  );
}

test("priorityColor preserves P0-P4 distinctions across dark and light themes", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const colors = [0, 1, 2, 3, 4].map((p) => priorityColor(p, theme));
    for (const color of colors) {
      assertFromTheme(color, theme);
    }
    assert.equal(new Set(colors).size, 5, "P0 through P4 must resolve to 5 distinct tokens");
    assert.equal(colors[0], theme.ansi1);
    assert.equal(colors[1], theme.blocked);
    assert.equal(colors[2], theme.accent);
    assert.equal(colors[3], theme.muted);
    assert.equal(colors[4], theme.dim);
  }
});

test("priorityColor keeps P0 and P1 distinct when blocked equals ansi1 or ansi tokens are absent", () => {
  const sharedRedTheme = {
    ...DARK_THEME,
    ansi1: "tok:shared:red",
    blocked: "tok:shared:red",
    ansi3: "tok:shared:amber"
  };

  const p0 = priorityColor(0, sharedRedTheme);
  const p1 = priorityColor(1, sharedRedTheme);
  assert.equal(p0, "tok:shared:red");
  assert.equal(p1, "tok:shared:amber");
  assert.notEqual(p0, p1);

  const semanticOnlyTheme = {
    background: "tok:sem:bg",
    surface: "tok:sem:surface",
    raised: "tok:sem:raised",
    border: "tok:sem:border",
    foreground: "tok:sem:fg",
    muted: "tok:sem:muted",
    dim: "tok:sem:dim",
    accent: "tok:sem:accent",
    working: "tok:sem:working",
    blocked: "tok:sem:blocked",
    done: "tok:sem:done"
  };

  const semanticPriorities = [0, 1, 2, 3, 4].map((p) => priorityColor(p, semanticOnlyTheme));
  assert.equal(new Set(semanticPriorities).size, 5);
  for (const color of semanticPriorities) {
    assertFromTheme(color, semanticOnlyTheme);
  }
});

test("priorityColor normalizes string labels and falls back to P4 for unknown values", () => {
  assert.equal(priorityColor("P0", DARK_THEME), priorityColor(0, DARK_THEME));
  assert.equal(priorityColor("p1", DARK_THEME), priorityColor(1, DARK_THEME));
  assert.equal(priorityColor("2", LIGHT_THEME), priorityColor(2, LIGHT_THEME));
  assert.equal(priorityColor(null, DARK_THEME), priorityColor(4, DARK_THEME));
  assert.equal(priorityColor(99, DARK_THEME), priorityColor(4, DARK_THEME));
});

test("statusColor distinguishes open, working, blocked, closed, ready, and deferred across themes", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const open = statusColor("open", theme);
    const inProgress = statusColor("in_progress", theme);
    const working = statusColor("working", theme);
    const blocked = statusColor("blocked", theme);
    const closed = statusColor("closed", theme);
    const done = statusColor("done", theme);
    const ready = statusColor("ready", theme);
    const deferred = statusColor("deferred", theme);

    assert.equal(open, theme.muted);
    assert.equal(inProgress, theme.working);
    assert.equal(working, theme.working);
    assert.equal(blocked, theme.blocked);
    assert.equal(closed, theme.done);
    assert.equal(done, theme.done);
    assert.equal(ready, theme.done);
    assert.equal(deferred, theme.dim);

    assert.equal(
      new Set([open, inProgress, blocked, closed, deferred]).size,
      5,
      "Core statuses must remain distinct"
    );

    for (const color of [open, inProgress, blocked, closed, ready, deferred]) {
      assertFromTheme(color, theme);
    }
  }
});

test("statusColor normalizes casing/hyphens and falls back when semantic status tokens are missing", () => {
  const ansiFallbackTheme = {
    foreground: "tok:fb:fg",
    muted: "tok:fb:muted",
    dim: "tok:fb:dim",
    accent: "tok:fb:accent",
    ansi1: "tok:fb:ansi1",
    ansi2: "tok:fb:ansi2",
    ansi3: "tok:fb:ansi3"
  };

  assert.equal(statusColor("IN-PROGRESS", ansiFallbackTheme), "tok:fb:accent");
  assert.equal(statusColor("BLOCKED", ansiFallbackTheme), "tok:fb:ansi1");
  assert.equal(statusColor("Closed", ansiFallbackTheme), "tok:fb:ansi2");
  assert.equal(statusColor("", ansiFallbackTheme), "tok:fb:muted");
  assert.equal(statusColor(undefined, ansiFallbackTheme), "tok:fb:muted");

  const collidingStatusTheme = {
    ...DARK_THEME,
    blocked: "tok:dup:alert",
    working: "tok:dup:alert"
  };
  assert.notEqual(
    statusColor("blocked", collidingStatusTheme),
    statusColor("in_progress", collidingStatusTheme)
  );
});

test("rowColors distinguishes default, highlighted, and selected rows using theme tokens", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const idleRow = rowColors({ selected: false, highlighted: false }, theme);
    const highlightedRow = rowColors({ selected: false, highlighted: true }, theme);
    const selectedRow = rowColors({ selected: true, highlighted: true }, theme);

    assert.equal(idleRow.bg, theme.surface);
    assert.equal(idleRow.border, theme.border);
    assert.equal(idleRow.hoverBg, theme.hover);

    assert.equal(highlightedRow.bg, theme.raised);
    assert.equal(highlightedRow.border, theme.input);
    assert.equal(highlightedRow.hoverBg, theme.hover);

    assert.equal(selectedRow.bg, theme.selected);
    assert.equal(selectedRow.border, theme.accent);
    assert.equal(selectedRow.hoverBg, theme.selected);

    assert.notEqual(idleRow.bg, highlightedRow.bg);
    assert.notEqual(highlightedRow.bg, selectedRow.bg);
    assert.notEqual(idleRow.border, selectedRow.border);
  }
});

test("rowColors and statusBorderColor resolve stateBorder from statusColor for known statuses and fall back for unknown/missing", () => {
  assert.equal(isKnownStatus("open"), true);
  assert.equal(isKnownStatus("in_progress"), true);
  assert.equal(isKnownStatus("In-Progress"), true);
  assert.equal(isKnownStatus("blocked"), true);
  assert.equal(isKnownStatus("closed"), true);
  assert.equal(isKnownStatus("done"), true);
  assert.equal(isKnownStatus("deferred"), true);
  assert.equal(isKnownStatus("ready"), true);
  assert.equal(isKnownStatus("custom_state"), true);

  assert.equal(isKnownStatus("unknown"), false);
  assert.equal(isKnownStatus("  UNKNOWN  "), false);
  assert.equal(isKnownStatus(""), false);
  assert.equal(isKnownStatus("   "), false);
  assert.equal(isKnownStatus(null), false);
  assert.equal(isKnownStatus(undefined), false);
  assert.equal(isKnownStatus(42), false);

  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    for (const status of ["open", "in_progress", "working", "blocked", "closed", "done", "ready", "deferred", "custom"]) {
      const borderColor = statusBorderColor(status, theme);
      const expected = statusColor(status, theme);
      assert.equal(borderColor, expected);
      assertFromTheme(borderColor, theme);

      const idle = rowColors({ selected: false, highlighted: false, status }, theme);
      const highlighted = rowColors({ selected: false, highlighted: true, status }, theme);
      const selected = rowColors({ selected: true, highlighted: true, status }, theme);

      assert.equal(idle.hasStateBorder, true);
      assert.equal(idle.stateBorder, expected);
      assert.equal(idle.border, theme.border);
      assert.equal(idle.bg, theme.surface);
      assert.equal(idle.hoverBg, theme.hover);
      assert.equal(idle.text, theme.foreground);
      assert.equal(idle.mutedText, theme.muted);
      assert.equal(idle.dimText, theme.dim);

      assert.equal(highlighted.hasStateBorder, true);
      assert.equal(highlighted.stateBorder, expected);
      assert.equal(highlighted.border, theme.input);
      assert.equal(highlighted.bg, theme.raised);
      assert.equal(highlighted.hoverBg, theme.hover);
      assert.equal(highlighted.text, theme.foreground);

      assert.equal(selected.hasStateBorder, true);
      assert.equal(selected.stateBorder, expected);
      assert.equal(selected.border, theme.accent);
      assert.equal(selected.bg, theme.selected);
      assert.equal(selected.hoverBg, theme.selected);
      assert.equal(selected.text, theme.foreground);
    }

    for (const missing of [null, undefined, "", "   ", "unknown", "UNKNOWN", 99, {}]) {
      assert.equal(statusBorderColor(missing, theme), theme.border);

      const idle = rowColors({ selected: false, highlighted: false, status: missing }, theme);
      const highlighted = rowColors({ selected: false, highlighted: true, status: missing }, theme);
      const selected = rowColors({ selected: true, highlighted: false, status: missing }, theme);

      assert.equal(idle.hasStateBorder, false);
      assert.equal(idle.stateBorder, theme.border);
      assert.equal(idle.border, theme.border);

      assert.equal(highlighted.hasStateBorder, false);
      assert.equal(highlighted.stateBorder, theme.input);
      assert.equal(highlighted.border, theme.input);

      assert.equal(selected.hasStateBorder, false);
      assert.equal(selected.stateBorder, theme.accent);
      assert.equal(selected.border, theme.accent);
    }
  }
});

test("controlColors resolves active, inactive, loading, and disabled states from theme tokens", () => {
  const inactiveFilter = controlColors({ active: false, mutedWhenInactive: true }, DARK_THEME);
  const activeFilter = controlColors({ active: true, mutedWhenInactive: true }, DARK_THEME);
  const loadingButton = controlColors({ loading: true }, DARK_THEME);
  const disabledButton = controlColors({ disabled: true }, DARK_THEME);

  assert.equal(inactiveFilter.bg, DARK_THEME.surface);
  assert.equal(inactiveFilter.border, DARK_THEME.border);
  assert.equal(inactiveFilter.text, DARK_THEME.muted);
  assert.equal(inactiveFilter.hoverBg, DARK_THEME.hover);

  assert.equal(activeFilter.bg, DARK_THEME.selected);
  assert.equal(activeFilter.border, DARK_THEME.accent);
  assert.equal(activeFilter.text, DARK_THEME.foreground);
  assert.equal(activeFilter.hoverBg, DARK_THEME.selected);

  assert.equal(loadingButton.bg, DARK_THEME.raised);
  assert.equal(loadingButton.text, DARK_THEME.dim);

  assert.equal(disabledButton.bg, DARK_THEME.surface);
  assert.equal(disabledButton.text, DARK_THEME.dim);
});

test("controlColors distinguishes ghost and solid variants across idle, active, loading, and disabled states", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const ghostIdle = controlColors({ variant: "ghost" }, theme);
    const solidIdle = controlColors({ variant: "solid" }, theme);
    const solidActive = controlColors({ variant: "solid", active: true }, theme);
    const solidDisabled = controlColors({ variant: "solid", disabled: true }, theme);
    const solidLoading = controlColors({ variant: "solid", loading: true }, theme);

    for (const palette of [ghostIdle, solidIdle, solidActive, solidDisabled, solidLoading]) {
      assertFromTheme(palette.bg, theme);
      assertFromTheme(palette.border, theme);
      assertFromTheme(palette.text, theme);
      assertFromTheme(palette.hoverBg, theme);
    }

    assert.equal(ghostIdle.bg, theme.surface);
    assert.equal(ghostIdle.border, theme.border);
    assert.equal(ghostIdle.text, theme.foreground);
    assert.equal(ghostIdle.hoverBg, theme.hover);

    assert.equal(solidIdle.bg, theme.accent);
    assert.equal(solidIdle.border, solidIdle.bg);
    assert.equal(solidIdle.text, theme.accent_foreground);
    assert.notEqual(solidIdle.bg, ghostIdle.bg);
    assert.notEqual(solidIdle.text, ghostIdle.text);
    assert.notEqual(solidIdle.hoverBg, solidIdle.bg);

    assert.equal(solidActive.border, solidActive.bg);
    assert.equal(solidActive.text, theme.accent_foreground);
    assert.equal(solidActive.hoverBg, theme.selected);
    assert.notDeepEqual(solidActive, solidIdle);

    assert.equal(solidDisabled.text, theme.dim);
    assert.equal(solidDisabled.bg, theme.surface);
    assert.equal(solidDisabled.border, theme.border);
    assert.equal(solidDisabled.hoverBg, solidDisabled.bg);

    assert.equal(solidLoading.text, theme.dim);
    assert.equal(solidLoading.bg, theme.raised);
    assert.equal(solidLoading.border, theme.border);
    assert.equal(solidLoading.hoverBg, solidLoading.bg);
  }

  const fallbackSolidTheme = {
    surface: "tok:fb:surface",
    raised: "tok:fb:raised",
    hover: "tok:fb:hover",
    selected: "tok:fb:selected",
    border: "tok:fb:border",
    foreground: "tok:fb:fg",
    muted: "tok:fb:muted",
    dim: "tok:fb:dim",
    solid: "tok:fb:solid",
    solid_foreground: "tok:fb:solid_fg"
  };

  const fallbackSolid = controlColors({ variant: "solid" }, fallbackSolidTheme);
  assert.equal(fallbackSolid.bg, "tok:fb:solid");
  assert.equal(fallbackSolid.border, "tok:fb:solid");
  assert.equal(fallbackSolid.text, "tok:fb:solid_fg");
});

test("errorColors, readyBadgeColors, priorityBadgeColors, dividerColors, and resolveThemeTokens never emit hardcoded colors", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const tokens = resolveThemeTokens(theme);
    const err = errorColors(theme);
    const ready = readyBadgeColors(theme);
    const badge = priorityBadgeColors(1, theme);
    const dividerIdle = dividerColors({ active: false, hovered: false }, theme);
    const dividerHover = dividerColors({ active: false, hovered: true }, theme);
    const dividerActive = dividerColors({ active: true, hovered: true }, theme);

    for (const value of [
      ...Object.values(tokens),
      ...Object.values(err),
      ...Object.values(ready),
      ...Object.values(badge),
      ...Object.values(dividerIdle),
      ...Object.values(dividerHover),
      ...Object.values(dividerActive)
    ]) {
      assertFromTheme(value, theme);
    }

    assert.equal(err.border, theme.blocked);
    assert.equal(err.text, theme.blocked);
    assert.equal(err.bg, theme.surface);

    assert.equal(ready.border, theme.done);
    assert.equal(ready.text, theme.done);
    assert.equal(ready.bg, theme.surface);

    assert.equal(badge.bg, theme.raised);
    assert.equal(badge.text, theme.blocked);

    assert.equal(dividerIdle.color, theme.border);
    assert.equal(dividerHover.color, theme.input);
    assert.equal(dividerActive.color, theme.accent);
  }

  const nestedTheme = { colors: LIGHT_THEME };
  assert.equal(resolveThemeTokens(nestedTheme).background, LIGHT_THEME.background);
});

test("priorityPillColors returns filled bg, colored border, and contrasting text for P0-P4 across light and dark themes", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const pills = [0, 1, 2, 3, 4].map((p) => priorityPillColors(p, theme));
    for (const pill of pills) {
      assertFromTheme(pill.bg, theme);
      assertFromTheme(pill.border, theme);
      assertFromTheme(pill.text, theme);
      assert.notEqual(pill.bg, pill.text, "Pill background and text must contrast");
    }
    assert.equal(new Set(pills.map((p) => p.text)).size, 5, "P0-P4 pill text colors must be distinct");
    assert.equal(new Set(pills.map((p) => p.border)).size, 5, "P0-P4 pill borders must be distinct");
    assert.equal(pills[0].border, theme.ansi1);
    assert.equal(pills[1].border, theme.blocked);
    assert.equal(pills[2].border, theme.accent);
  }
});

test("typeColor and typePillColors colorize bug, feature, task, epic, and chore distinctly across themes", () => {
  const darkWithAnsi5 = { ...DARK_THEME, ansi5: "tok:dark:ansi5" };
  const lightWithAnsi5 = { ...LIGHT_THEME, ansi5: "tok:light:ansi5" };

  for (const theme of [darkWithAnsi5, lightWithAnsi5]) {
    const types = ["bug", "feature", "task", "epic", "chore"];
    const pills = types.map((type) => typePillColors(type, theme));
    for (const pill of pills) {
      assertFromTheme(pill.bg, theme);
      assertFromTheme(pill.border, theme);
      assertFromTheme(pill.text, theme);
      assert.notEqual(pill.bg, pill.text, "Type pill background and text must contrast");
      assert.equal(pill.border, pill.text, "Type pill border matches its semantic type color");
    }
    assert.equal(
      new Set(pills.map((p) => p.text)).size,
      5,
      "bug, feature, task, epic, and chore must resolve to distinct colors"
    );
    assert.equal(typeColor("bug", theme), theme.ansi1);
    assert.equal(typeColor("feature", theme), theme.accent);
    assert.equal(typeColor("task", theme), theme.ansi6);
    assert.equal(typeColor("epic", theme), theme.ansi5);
    assert.equal(typeColor("chore", theme), theme.ansi3);
  }
});

test("statusPillColors returns filled pills with distinct border/text for open, in_progress/progress, blocked, closed, ready, and deferred", () => {
  for (const theme of [DARK_THEME, LIGHT_THEME]) {
    const statuses = ["open", "in_progress", "blocked", "closed", "deferred"];
    const pills = statuses.map((s) => statusPillColors(s, theme));

    for (const pill of pills) {
      assertFromTheme(pill.bg, theme);
      assertFromTheme(pill.border, theme);
      assertFromTheme(pill.text, theme);
      assert.notEqual(pill.bg, pill.text, "Status pill background and text must contrast");
    }

    assert.equal(
      new Set(pills.map((p) => `${p.bg}|${p.border}|${p.text}`)).size,
      5,
      "Each status pill must have a distinct visual signature"
    );

    const progressAlias = statusPillColors("progress", theme);
    const inProgress = statusPillColors("in_progress", theme);
    assert.deepEqual(progressAlias, inProgress);
    assert.equal(inProgress.text, theme.working);
    assert.equal(inProgress.border, theme.working);

    const blocked = statusPillColors("blocked", theme);
    assert.equal(blocked.text, theme.blocked);
    assert.equal(blocked.border, theme.blocked);

    const closed = statusPillColors("closed", theme);
    assert.equal(closed.text, theme.done);
    assert.equal(closed.border, theme.done);

    const ready = statusPillColors("ready", theme);
    assert.equal(ready.text, theme.done);
    assert.equal(ready.border, theme.done);
  }
});

test("isDarkColor classifies #rgb, #rrggbb, and #rrggbbaa by relative luminance and returns false for invalid inputs", () => {
  assert.equal(isDarkColor("#000"), true);
  assert.equal(isDarkColor("#123"), true);
  assert.equal(isDarkColor("#0f172a"), true);
  assert.equal(isDarkColor("#0f172aff"), true);
  assert.equal(isDarkColor("#b8b8b8"), true);

  assert.equal(isDarkColor("#fff"), false);
  assert.equal(isDarkColor("#ffffff"), false);
  assert.equal(isDarkColor("#f8fafcff"), false);
  assert.equal(isDarkColor("#bcbcbc"), false);

  assert.equal(isDarkColor(""), false);
  assert.equal(isDarkColor(null), false);
  assert.equal(isDarkColor(undefined), false);
  assert.equal(isDarkColor("tok:dark:bg"), false);
  assert.equal(isDarkColor("#12"), false);
  assert.equal(isDarkColor("#12345"), false);
  assert.equal(isDarkColor("#gggggg"), false);
});

test("parseHexColor, relativeLuminance, contrastRatio, and pickReadableColor compute WCAG contrast accurately with alpha compositing", () => {
  assert.deepEqual(parseHexColor("#09f"), { r: 0, g: 153, b: 255, a: 1 });
  assert.deepEqual(parseHexColor("#1e293b"), { r: 30, g: 41, b: 59, a: 1 });
  assert.deepEqual(parseHexColor("#1e293bcc"), { r: 30, g: 41, b: 59, a: 204 / 255 });
  assert.deepEqual(parseHexColor("#ffffff17"), { r: 255, g: 255, b: 255, a: 23 / 255 });
  assert.equal(parseHexColor("not-a-color"), null);
  assert.equal(parseHexColor("#12345"), null);

  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("invalid"), null);

  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.equal(contrastRatio("#000000", "invalid"), null);

  // #ffffff17 (~9% white) composited over #17191d is near-black (~1.28:1 against #17191d, not 17.5:1)
  const translucentWhiteOnDark = contrastRatio("#ffffff17", "#17191d", "#17191d");
  assert.ok(
    translucentWhiteOnDark < 1.35,
    `Expected #ffffff17 composited over #17191d to have < 1.35:1 contrast with #17191d, got ${translucentWhiteOnDark}`
  );

  assert.equal(pickReadableColor("#1d4ed8", ["#1e293b", "#ffffff", "#94a3b8"]), "#ffffff");
  assert.equal(pickReadableColor("#fde047", ["#ffffff", "#0f172a", "#fef08a"]), "#0f172a");
  assert.equal(pickReadableColor("invalid", ["#ffffff"]), null);
  assert.equal(pickReadableColor("#1d4ed8", ["invalid"]), null);
});

test("controlColors solid variant keeps active and hover readable on the real Herdr machine theme with translucent selected/hover tokens", () => {
  const realMachineTheme = {
    accent: "#96b2d7",
    accent_foreground: "#17191d",
    solid: "#eeeeef",
    solid_foreground: "#111215",
    selected: "#ffffff17",
    hover: "#ffffff0e",
    input: "#ffffff24",
    border: "#ffffff18",
    background: "#17191d",
    surface: "#17191d",
    raised: "#2c2e31",
    popover: "#25272b",
    foreground: "#eeeeef",
    muted: "#98999b",
    dim: "#696a6d",
    working: "#e5c07b"
  };

  // Verify the original bug condition: selected (#ffffff17 over #17191d) vs accent_foreground (#17191d) is black-on-black (< 1.35:1)
  assert.ok(
    contrastRatio(realMachineTheme.selected, realMachineTheme.accent_foreground, realMachineTheme.surface) < 1.35
  );

  const resting = controlColors({ variant: "solid" }, realMachineTheme);
  const active = controlColors({ variant: "solid", active: true }, realMachineTheme);

  assert.equal(resting.bg, "#96b2d7");
  assert.equal(resting.text, "#17191d");
  assert.notEqual(resting.hoverBg, resting.bg);
  assert.notEqual(resting.hoverBg, realMachineTheme.selected);
  assert.ok(
    contrastRatio(resting.hoverBg, resting.text, realMachineTheme.surface) >= 4.5,
    `Expected resting hover contrast >= 4.5:1, got ${contrastRatio(resting.hoverBg, resting.text, realMachineTheme.surface)}`
  );

  assert.equal(active.text, "#17191d");
  assert.notEqual(active.bg, realMachineTheme.selected);
  assert.notEqual(active.hoverBg, realMachineTheme.selected);
  assert.notEqual(active.hoverBg, resting.bg, "active+hover bg must stay visually different from resting bg");
  assert.ok(
    contrastRatio(active.bg, active.text, realMachineTheme.surface) >= 4.5,
    `Expected active bg contrast >= 4.5:1, got ${contrastRatio(active.bg, active.text, realMachineTheme.surface)}`
  );
  assert.ok(
    contrastRatio(active.hoverBg, active.text, realMachineTheme.surface) >= 4.5,
    `Expected active+hover contrast >= 4.5:1, got ${contrastRatio(active.hoverBg, active.text, realMachineTheme.surface)}`
  );

  // Hover and active are shades of the accent, not unrelated theme tokens
  for (const shade of [resting.hoverBg, active.bg, active.hoverBg]) {
    const rgb = parseHexColor(shade);
    assert.ok(rgb, `Expected an opaque hex shade, got ${shade}`);
    assert.equal(rgb.a, 1);
    assert.ok(
      rgb.r < rgb.g && rgb.g < rgb.b,
      `Expected a blue-tinted shade of #96b2d7, got ${shade}`
    );
  }
});

test("controlColors solid variant keeps hover and active states readable across light/dark themes and light/dark accents", () => {
  const lightThemeDarkAccent = {
    background: "#ffffff",
    surface: "#f8fafc",
    raised: "#f1f5f9",
    hover: "#e2e8f0",
    selected: "#dbeafe", // light blue (1.35:1 against white text — must NOT be picked for hover!)
    border: "#cbd5e1",
    input: "#94a3b8",
    foreground: "#0f172a",
    muted: "#475569",
    dim: "#94a3b8",
    accent: "#1d4ed8", // dark blue (6.70:1 against #ffffff)
    accent_foreground: "#ffffff",
    solid: "#1e40af", // darker blue (8.72:1 against #ffffff)
    solid_foreground: "#ffffff",
    working: "#1e3a8a"
  };

  const lightThemeLightAccent = {
    background: "#ffffff",
    surface: "#f8fafc",
    raised: "#f1f5f9",
    hover: "#e2e8f0",
    selected: "#1e293b", // dark slate (1.28:1 against #0f172a text — must NOT be picked!)
    border: "#cbd5e1",
    input: "#cbd5e1",
    foreground: "#0f172a",
    muted: "#475569",
    dim: "#94a3b8",
    accent: "#fde047", // bright yellow (15.4:1 against #0f172a)
    accent_foreground: "#ffffff", // misconfigured white on yellow (1.35:1) -> readable picks #0f172a
    solid: "#facc15", // amber yellow (13.3:1 against #0f172a)
    solid_foreground: "#0f172a",
    working: "#fef08a"
  };

  const darkThemeDarkAccent = {
    background: "#0f172a",
    surface: "#1e293b",
    raised: "#334155",
    hover: "#475569",
    selected: "#bae6fd", // pale sky (1.60:1 against #ffffff — must NOT be picked!)
    border: "#334155",
    input: "#1e40af",
    foreground: "#f8fafc",
    muted: "#94a3b8",
    dim: "#64748b",
    accent: "#2563eb", // blue (5.17:1 against #ffffff)
    accent_foreground: "#ffffff",
    solid: "#1d4ed8", // darker blue (6.70:1 against #ffffff)
    solid_foreground: "#ffffff",
    working: "#1e3a8a"
  };

  const darkThemeLightAccent = {
    background: "#0f172a",
    surface: "#1e293b",
    raised: "#334155",
    hover: "#475569",
    selected: "#1e293b", // dark surface (1.28:1 against #0f172a — must NOT be picked!)
    border: "#334155",
    input: "#334155",
    foreground: "#f8fafc",
    muted: "#94a3b8",
    dim: "#64748b",
    accent: "#38bdf8", // sky blue (8.29:1 against #0f172a)
    accent_foreground: "#0f172a",
    solid: "#7dd3fc", // lighter sky blue (10.97:1 against #0f172a)
    solid_foreground: "#0f172a",
    working: "#bae6fd"
  };

  for (const theme of [
    lightThemeDarkAccent,
    lightThemeLightAccent,
    darkThemeDarkAccent,
    darkThemeLightAccent
  ]) {
    const resting = controlColors({ variant: "solid" }, theme);
    const active = controlColors({ variant: "solid", active: true }, theme);

    const restingTextContrast = contrastRatio(resting.bg, resting.text);
    const restingHoverContrast = contrastRatio(resting.hoverBg, resting.text);
    const activeBgContrast = contrastRatio(active.bg, active.text);
    const activeHoverContrast = contrastRatio(active.hoverBg, active.text);

    assert.ok(
      restingTextContrast >= 4.5,
      `Expected resting bg/text contrast >= 4.5, got ${restingTextContrast}`
    );
    assert.ok(
      restingHoverContrast >= 4.5,
      `Expected resting hoverBg/text contrast >= 4.5, got ${restingHoverContrast}`
    );
    assert.notEqual(resting.hoverBg, resting.bg, "hoverBg should differ from resting bg when possible");

    assert.ok(
      activeBgContrast >= 3,
      `Expected active bg/text contrast >= 3.0, got ${activeBgContrast}`
    );
    assert.ok(
      activeHoverContrast >= 3,
      `Expected active hoverBg/text contrast >= 3.0, got ${activeHoverContrast}`
    );
  }

  // A saturated accent still gets a derived hover shade: no theme token has to qualify
  const saturatedAccentTheme = {
    background: "#0f172a",
    surface: "#1e293b",
    raised: "#93c5fd",
    hover: "#93c5fd",
    selected: "#dbeafe",
    border: "#334155",
    input: "#60a5fa",
    foreground: "#ffffff",
    muted: "#94a3b8",
    dim: "#64748b",
    accent: "#1d4ed8",
    accent_foreground: "#ffffff",
    solid: "#3b82f6", // 3.68:1 against #ffffff (>= 3:1, < 4.5:1)
    solid_foreground: "#ffffff",
    working: "#60a5fa"
  };
  const saturatedIdle = controlColors({ variant: "solid" }, saturatedAccentTheme);
  assert.notEqual(saturatedIdle.hoverBg, saturatedIdle.bg);
  assert.equal(saturatedIdle.hoverBg, mixHexColors("#1d4ed8", "#000000", 0.1));
  assert.ok(contrastRatio(saturatedIdle.hoverBg, saturatedIdle.text) >= 4.5);

  // A base color that no unrelated token can pair with still gets a readable shade of itself
  const sameToneTheme = {
    background: "#ffffff",
    surface: "#f8fafc",
    raised: "#f1f5f9",
    hover: "#e2e8f0",
    selected: "#dbeafe",
    border: "#cbd5e1",
    input: "#bfdbfe",
    foreground: "#ffffff",
    muted: "#94a3b8",
    dim: "#64748b",
    accent: "#1d4ed8",
    accent_foreground: "#ffffff",
    solid: "#93c5fd",
    solid_foreground: "#ffffff",
    working: "#bfdbfe"
  };
  const sameToneIdle = controlColors({ variant: "solid" }, sameToneTheme);
  assert.notEqual(sameToneIdle.hoverBg, sameToneIdle.bg);
  assert.ok(contrastRatio(sameToneIdle.hoverBg, sameToneIdle.text) >= 4.5);
});

test("mixHexColors blends opaquely and shiftForReadability keeps hue while moving away from the text luminance", () => {
  assert.equal(mixHexColors("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHexColors("#96b2d7", "#ffffff", 0), "#96b2d7");
  assert.equal(mixHexColors("#96b2d7", "#ffffff", 1), "#ffffff");
  assert.equal(mixHexColors(null, "#ffffff", 0.5), null);
  assert.equal(mixHexColors("#96b2d7", "not-a-color", 0.5), null);

  // Translucent inputs are composited first, so the result never carries alpha
  assert.equal(mixHexColors("#ffffff17", "#17191d", 0), "#2c2e31");
  assert.match(mixHexColors("#ffffff17", "#17191d", 0.5), /^#[0-9a-f]{6}$/);

  // Dark text -> lighten the accent, preserving channel ordering (same hue family)
  const lightened = shiftForReadability("#96b2d7", "#17191d", {
    backdropColor: "#17191d",
    preferredAmount: 0.1
  });
  assert.equal(lightened, "#a1badb");
  const lightenedRgb = parseHexColor(lightened);
  assert.ok(lightenedRgb.r < lightenedRgb.g && lightenedRgb.g < lightenedRgb.b);

  // Light text -> darken the accent instead
  const darkened = shiftForReadability("#1d4ed8", "#ffffff", {
    backdropColor: "#1e293b",
    preferredAmount: 0.1
  });
  assert.equal(darkened, "#1a46c2");

  // Insufficient contrast at the preferred amount keeps shifting further in the same direction
  const pushed = shiftForReadability("#93c5fd", "#ffffff", {
    backdropColor: "#f8fafc",
    preferredAmount: 0.1,
    minContrast: 4.5
  });
  assert.ok(pushed);
  assert.ok(contrastRatio(pushed, "#ffffff") >= 4.5);

  // Pure white base cannot lighten any further -> the opposite direction is used instead
  const reversed = shiftForReadability("#ffffff", "#17191d", {
    backdropColor: "#17191d",
    preferredAmount: 0.1,
    minContrast: 4.5
  });
  assert.ok(reversed);
  assert.notEqual(reversed, "#ffffff");
  assert.ok(contrastRatio(reversed, "#17191d") >= 4.5);

  assert.equal(shiftForReadability("nope", "#17191d"), null);
});
