import test from "node:test";
import assert from "node:assert/strict";
import { resolveProjectContext, resolveVisibilityAction } from "../mods/beads-desktop/context.js";

const space = {
  id: "space-1",
  name: "workspace",
  machine: null,
  folder: "/stale/workspace-folder"
};

test("focused cwd overrides stale space.folder and focused tab is part of the key", () => {
  const context = resolveProjectContext({
    focused: { space: "space-1", tab: "tab-b", cwd: "/projects/tab-b" },
    spaces: [space]
  });

  assert.equal(context.cwd, "/projects/tab-b");
  assert.equal(context.supported, true);
  assert.match(context.key, /tab-b/);
  assert.doesNotMatch(context.key, /stale\/workspace-folder/);
});

test("two tabs in one workspace produce distinct project contexts", () => {
  const first = resolveProjectContext({
    focused: { space: "space-1", tab: "tab-a", cwd: "/projects/tab-a" },
    spaces: [space]
  });
  const second = resolveProjectContext({
    focused: { space: "space-1", tab: "tab-b", cwd: "/projects/tab-b" },
    spaces: [space]
  });

  assert.notEqual(first.key, second.key);
  assert.equal(first.cwd, "/projects/tab-a");
  assert.equal(second.cwd, "/projects/tab-b");
});

test("mod focus preserves the previous valid context for the same tab", () => {
  const previous = {
    key: "local:space-1:tab-a:/projects/tab-a",
    supported: true,
    cwd: "/projects/tab-a",
    spaceId: "space-1",
    tabId: "tab-a",
    spaceName: "workspace",
    machine: null
  };
  const context = resolveProjectContext({
    focused: { space: "space-1", tab: "tab-a", cwd: null },
    spaces: [space]
  }, previous);

  assert.equal(context.key, previous.key);
  assert.equal(context.cwd, previous.cwd);
});

test("remote focused context keeps its cwd and Herdr machine for remote exec", () => {
  const context = resolveProjectContext({
    focused: { space: "space-1", tab: "tab-a", cwd: "/remote/project" },
    spaces: [{ ...space, machine: "ai-developer" }]
  });

  assert.equal(context.supported, true);
  assert.equal(context.cwd, "/remote/project");
  assert.equal(context.machine, "ai-developer");
  assert.match(context.key, /ai-developer/);
});

test("successful br load shows an actually hidden block after hot reload", () => {
  assert.equal(
    resolveVisibilityAction({ id: "mod-block", hidden: true }, false, false),
    "show"
  );
});

test("visibility actions do not repeat an identical layout transition", () => {
  assert.equal(resolveVisibilityAction({ id: "mod-block", hidden: true }, true, true), "none");
  assert.equal(resolveVisibilityAction({ id: "mod-block", hidden: false }, false, false), "none");
  assert.equal(resolveVisibilityAction({ id: "mod-block", hidden: false }, false, true), "hide");
});

test("resolveProjectContext returns unsupported when there is no space", () => {
  const result = resolveProjectContext({ focused: null, spaces: [] }, null);
  assert.equal(result.supported, false);
  assert.equal(result.key, "none");
  assert.equal(result.cwd, null);
  assert.equal(result.machine, null);
});

test("resolveProjectContext falls back to space.folder when focused cwd is missing", () => {
  const result = resolveProjectContext(
    {
      focused: { tab: "t1", cwd: "" },
      spaces: [{ id: "s1", active: true, folder: "/space/folder", machine: "m1" }]
    },
    null
  );
  assert.equal(result.supported, true);
  assert.equal(result.cwd, "/space/folder");
  assert.equal(result.machine, "m1");
  assert.equal(result.tabId, "t1");
});

test("resolveProjectContext returns nofolder when neither focused cwd nor folder exists", () => {
  const result = resolveProjectContext(
    { focused: { tab: "t1", cwd: "" }, spaces: [{ id: "s1", active: true, folder: "" }] },
    null
  );
  assert.equal(result.supported, false);
  assert.equal(result.key, "nofolder:s1:t1");
  assert.equal(result.cwd, null);
});

test("resolveProjectContext preserves previous cwd when focus leaves the terminal", () => {
  const previous = {
    key: "local:s1:t1::/prev",
    supported: true,
    cwd: "/prev",
    tabId: "t1",
    spaceId: "s1",
    machine: null
  };
  const result = resolveProjectContext(
    { focused: { tab: "t1", cwd: "" }, spaces: [{ id: "s1", active: true, folder: "" }] },
    previous
  );
  assert.equal(result.supported, true);
  assert.equal(result.cwd, "/prev");
  assert.equal(result.key, previous.key);
});

test("resolveProjectContext does not preserve cwd across a different space", () => {
  const previous = {
    key: "local:s1:t1::/prev",
    supported: true,
    cwd: "/prev",
    tabId: "t1",
    spaceId: "s1",
    machine: null
  };
  const result = resolveProjectContext(
    { focused: { tab: "t1", cwd: "" }, spaces: [{ id: "s2", active: true, folder: "/other" }] },
    previous
  );
  assert.equal(result.supported, true);
  assert.equal(result.cwd, "/other");
});
