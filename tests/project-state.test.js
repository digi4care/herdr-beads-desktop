import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_STATE_STORAGE_KEY,
  projectStateKey,
  parseProjectState,
  serializeProjectState,
  readProjectState,
  writeProjectState,
  getProjectLayout,
  setProjectLayout,
  resolveProjectDetailRatio
} from "../mods/beads-desktop/project-state.js";
import {
  DEFAULT_DETAILS_RATIO,
  MIN_DETAILS_RATIO,
  MAX_DETAILS_RATIO,
  DETAILS_RATIO_STORAGE_KEY
} from "../mods/beads-desktop/details-layout.js";

function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    has(key) {
      return map.has(key);
    },
    raw: map
  };
}

test("projectStateKey is stable for the same project across tabs", () => {
  const a = projectStateKey({ machine: "srv", workspace: "ws", cwd: "/home/x/repo" });
  const b = projectStateKey({ machine: "srv", workspace: "ws", cwd: "/home/x/repo" });
  assert.equal(a, b);
  assert.equal(a, "srv|ws|/home/x/repo");
});

test("projectStateKey differs for different cwd, machine or workspace", () => {
  const base = { machine: "srv", workspace: "ws", cwd: "/repo" };
  assert.notEqual(projectStateKey(base), projectStateKey({ ...base, cwd: "/other" }));
  assert.notEqual(projectStateKey(base), projectStateKey({ ...base, machine: "other" }));
  assert.notEqual(projectStateKey(base), projectStateKey({ ...base, workspace: "other" }));
});

test("projectStateKey normalizes trailing slashes and whitespace in cwd", () => {
  assert.equal(
    projectStateKey({ machine: "m", workspace: "w", cwd: "/home/x/repo/" }),
    projectStateKey({ machine: "m", workspace: "w", cwd: "/home/x/repo" })
  );
  assert.equal(
    projectStateKey({ machine: "m", workspace: "w", cwd: "  /home/x/repo//  " }),
    "m|w|/home/x/repo"
  );
  assert.equal(projectStateKey({ cwd: "/" }), "local||/");
});

test("projectStateKey handles missing fields and never returns an empty key", () => {
  assert.equal(projectStateKey(), "local||");
  assert.equal(projectStateKey({}), "local||");
  assert.equal(projectStateKey({ machine: "", workspace: "", cwd: "" }), "local||");
  assert.equal(projectStateKey({ machine: "  ", workspace: "", cwd: "" }), "local||");
});

test("parseProjectState round-trips an encoded state", () => {
  const key = projectStateKey({ machine: "m", workspace: "w", cwd: "/repo" });
  const state = { [key]: { detailRatio: 0.42, detailsCollapsed: true } };
  const parsed = parseProjectState(serializeProjectState(state));
  assert.deepEqual(parsed, state);
});

test("parseProjectState drops invalid ratios and keeps valid ones", () => {
  const key = "m|w|/repo";
  const parsed = parseProjectState({
    [key]: { detailRatio: 0.42 },
    "bad-ratio": { detailRatio: 5 },
    "neg-ratio": { detailRatio: -1 },
    "nan-ratio": { detailRatio: NaN },
    "zero-ratio": { detailRatio: 0 },
    "one-ratio": { detailRatio: 1 },
    "string-ratio": { detailRatio: "0.5" }
  });
  assert.equal(parsed[key].detailRatio, 0.42);
  assert.equal("bad-ratio" in parsed, false);
  assert.equal("neg-ratio" in parsed, false);
  assert.equal("nan-ratio" in parsed, false);
  assert.equal("zero-ratio" in parsed, false);
  assert.equal("one-ratio" in parsed, false);
  assert.equal("string-ratio" in parsed, false);
});

test("parseProjectState keeps detailsCollapsed only when boolean", () => {
  const parsed = parseProjectState({
    a: { detailsCollapsed: true },
    b: { detailsCollapsed: false },
    c: { detailsCollapsed: "yes" },
    d: { detailsCollapsed: 1 }
  });
  assert.equal(parsed.a.detailsCollapsed, true);
  assert.equal(parsed.b.detailsCollapsed, false);
  assert.equal("c" in parsed, false);
  assert.equal("d" in parsed, false);
});

test("parseProjectState drops non-object entries and unknown keys", () => {
  const parsed = parseProjectState({
    good: { detailRatio: 0.3, detailsCollapsed: false, extra: "x" },
    bad: 42,
    alsoBad: null,
    arr: [1, 2]
  });
  assert.deepEqual(Object.keys(parsed), ["good"]);
  assert.deepEqual(parsed.good, { detailRatio: 0.3, detailsCollapsed: false });
});

test("parseProjectState survives junk, null, arrays and broken JSON", () => {
  assert.deepEqual(parseProjectState(null), {});
  assert.deepEqual(parseProjectState(undefined), {});
  assert.deepEqual(parseProjectState("null"), {});
  assert.deepEqual(parseProjectState("[1,2,3]"), {});
  assert.deepEqual(parseProjectState("{not json"), {});
  assert.deepEqual(parseProjectState(42), {});
  assert.deepEqual(parseProjectState(""), {});
});

test("parseProjectState is safe against prototype pollution", () => {
  const parsed = parseProjectState(
    '{"__proto__":{"detailRatio":0.9},"constructor":{"detailRatio":0.9},"ok":{"detailRatio":0.3}}'
  );
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal({}.detailRatio, undefined);
  assert.equal(parsed.ok.detailRatio, 0.3);
});

test("serializeProjectState sorts project keys", () => {
  const serialized = serializeProjectState({
    zeta: { detailRatio: 0.3 },
    alpha: { detailRatio: 0.4 },
    mid: { detailRatio: 0.5 }
  });
  assert.equal(
    serialized,
    '{"alpha":{"detailRatio":0.4},"mid":{"detailRatio":0.5},"zeta":{"detailRatio":0.3}}'
  );
});

test("serializeProjectState is stable for reordered input", () => {
  const a = serializeProjectState({
    alpha: { detailRatio: 0.4, detailsCollapsed: true },
    beta: { detailRatio: 0.3 }
  });
  const b = serializeProjectState({
    beta: { detailRatio: 0.3 },
    alpha: { detailRatio: 0.4, detailsCollapsed: true }
  });
  assert.equal(a, b);
});

test("serializeProjectState returns an empty object for junk input", () => {
  assert.equal(serializeProjectState(null), "{}");
  assert.equal(serializeProjectState(undefined), "{}");
  assert.equal(serializeProjectState("junk"), "{}");
  assert.equal(serializeProjectState(42), "{}");
  assert.equal(serializeProjectState([]), "{}");
});

test("readProjectState reads through a fake storage shim", () => {
  const key = projectStateKey({ machine: "m", workspace: "w", cwd: "/repo" });
  const storage = createFakeStorage({
    [PROJECT_STATE_STORAGE_KEY]: JSON.stringify({ [key]: { detailRatio: 0.44 } })
  });
  const state = readProjectState(storage);
  assert.equal(state[key].detailRatio, 0.44);
});

test("readProjectState returns an empty object for missing or throwing storage", () => {
  assert.deepEqual(readProjectState(null), {});
  assert.deepEqual(readProjectState(undefined), {});
  assert.deepEqual(readProjectState({}), {});
  const throwing = {
    getItem() {
      throw new Error("nope");
    }
  };
  assert.deepEqual(readProjectState(throwing), {});
});

test("writeProjectState writes under the shared key and returns true", () => {
  const storage = createFakeStorage();
  const key = projectStateKey({ machine: "m", workspace: "w", cwd: "/repo" });
  const ok = writeProjectState(storage, { [key]: { detailRatio: 0.4 } });
  assert.equal(ok, true);
  assert.equal(storage.has(PROJECT_STATE_STORAGE_KEY), true);
});

test("writeProjectState returns false for missing or throwing storage", () => {
  assert.equal(writeProjectState(null, {}), false);
  assert.equal(writeProjectState(undefined, {}), false);
  assert.equal(writeProjectState({}, {}), false);
  const throwing = {
    setItem() {
      throw new Error("nope");
    }
  };
  assert.equal(writeProjectState(throwing, {}), false);
});

test("write then read round-trips the project state", () => {
  const storage = createFakeStorage();
  const key = projectStateKey({ machine: "m", workspace: "w", cwd: "/repo" });
  const state = { [key]: { detailRatio: 0.47, detailsCollapsed: true } };
  assert.equal(writeProjectState(storage, state), true);
  assert.deepEqual(readProjectState(storage), state);
});

test("getProjectLayout returns defaults for unknown projects", () => {
  assert.deepEqual(getProjectLayout({}, "m|w|/repo"), {
    detailRatio: null,
    detailsCollapsed: false
  });
  assert.deepEqual(getProjectLayout(null, "m|w|/repo"), {
    detailRatio: null,
    detailsCollapsed: false
  });
});

test("getProjectLayout returns null detailRatio when the project has no ratio", () => {
  const layout = getProjectLayout({ "m|w|/repo": { detailsCollapsed: true } }, "m|w|/repo");
  assert.equal(layout.detailRatio, null);
  assert.equal(layout.detailsCollapsed, true);
});

test("getProjectLayout returns the stored values for a known project", () => {
  const layout = getProjectLayout(
    { "m|w|/repo": { detailRatio: 0.42, detailsCollapsed: true } },
    "m|w|/repo"
  );
  assert.equal(layout.detailRatio, 0.42);
  assert.equal(layout.detailsCollapsed, true);
});

test("setProjectLayout merges the patch into the project entry", () => {
  const key = "m|w|/repo";
  const next = setProjectLayout({ [key]: { detailRatio: 0.4 } }, key, {
    detailsCollapsed: true
  });
  assert.equal(next[key].detailRatio, 0.4);
  assert.equal(next[key].detailsCollapsed, true);
});

test("setProjectLayout does not erase an existing ratio with a null patch", () => {
  const key = "m|w|/repo";
  const withNull = setProjectLayout({ [key]: { detailRatio: 0.4 } }, key, {
    detailRatio: null
  });
  assert.equal(withNull[key].detailRatio, 0.4);
  const withUndefined = setProjectLayout({ [key]: { detailRatio: 0.4 } }, key, {
    detailRatio: undefined
  });
  assert.equal(withUndefined[key].detailRatio, 0.4);
});

test("setProjectLayout sanitizes the resulting state", () => {
  const key = "m|w|/repo";
  const next = setProjectLayout({}, key, {
    detailRatio: 9,
    detailsCollapsed: "nope",
    extra: true
  });
  assert.equal(key in next, false);

  const withValid = setProjectLayout({}, key, {
    detailRatio: 0.4,
    detailsCollapsed: "nope",
    extra: true
  });
  assert.deepEqual(withValid[key], { detailRatio: 0.4 });
});

test("setProjectLayout does not mutate the previous state object", () => {
  const key = "m|w|/repo";
  const before = { [key]: { detailRatio: 0.4 } };
  const after = setProjectLayout(before, key, { detailRatio: 0.6 });
  assert.equal(before[key].detailRatio, 0.4);
  assert.equal(after[key].detailRatio, 0.6);
});

test("resolveProjectDetailRatio uses the legacy ratio when the project has none", () => {
  const ratio = resolveProjectDetailRatio({
    state: {},
    projectKey: "m|w|/repo",
    legacyRatio: 0.55
  });
  assert.equal(ratio, 0.55);
});

test("resolveProjectDetailRatio prefers the project ratio over the legacy one", () => {
  const ratio = resolveProjectDetailRatio({
    state: { "m|w|/repo": { detailRatio: 0.3 } },
    projectKey: "m|w|/repo",
    legacyRatio: 0.55
  });
  assert.equal(ratio, 0.3);
});

test("resolveProjectDetailRatio falls back to the default for an invalid legacy ratio", () => {
  assert.equal(
    resolveProjectDetailRatio({
      state: {},
      projectKey: "m|w|/repo",
      legacyRatio: "nope"
    }),
    DEFAULT_DETAILS_RATIO
  );
  assert.equal(
    resolveProjectDetailRatio({ state: {}, projectKey: "m|w|/repo" }),
    DEFAULT_DETAILS_RATIO
  );
});

test("resolveProjectDetailRatio clamps the project ratio into the allowed bounds", () => {
  const ratio = resolveProjectDetailRatio({
    state: { "m|w|/repo": { detailRatio: 0.99 } },
    projectKey: "m|w|/repo"
  });
  assert.equal(ratio, MAX_DETAILS_RATIO);
  const low = resolveProjectDetailRatio({
    state: { "m|w|/repo": { detailRatio: 0.05 } },
    projectKey: "m|w|/repo"
  });
  assert.equal(low, MIN_DETAILS_RATIO);
});

test("the legacy global storage key remains the old global key", () => {
  assert.equal(DETAILS_RATIO_STORAGE_KEY, "beads-desktop:details-height-ratio");
  assert.equal(PROJECT_STATE_STORAGE_KEY, "beads-desktop:project-state");
});
