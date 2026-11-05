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
