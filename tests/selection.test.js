import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSelection,
  shouldLoadDetails,
  isStaleSelectionRequest,
  resolveHighlightId
} from "../mods/beads-desktop/selection.js";

const issues = [
  { id: "hbd-1", title: "First" },
  { id: "hbd-2", title: "Second" },
  { id: "hbd-3", title: "Third" }
];

test("initial load selects the first visible issue", () => {
  const result = resolveSelection({ visibleIssues: issues, selectedId: null });

  assert.equal(result.selectedId, "hbd-1");
  assert.equal(result.changed, true);
  assert.equal(result.reason, "first-visible");
});

test("empty visible list resolves to no selection", () => {
  const result = resolveSelection({ visibleIssues: [], selectedId: null });

  assert.equal(result.selectedId, null);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "empty");
});

test("ordinary refresh preserves an existing valid selection", () => {
  const result = resolveSelection({ visibleIssues: issues, selectedId: "hbd-2" });

  assert.equal(result.selectedId, "hbd-2");
  assert.equal(result.changed, false);
  assert.equal(result.reason, "preserved");
});

test("a selection that is no longer visible falls back to the first visible issue", () => {
  const result = resolveSelection({ visibleIssues: issues, selectedId: "hbd-99" });

  assert.equal(result.selectedId, "hbd-1");
  assert.equal(result.changed, true);
  assert.equal(result.reason, "first-visible");
});

test("context change forces the first visible issue even for a valid selection", () => {
  const result = resolveSelection({ visibleIssues: issues, selectedId: "hbd-2", force: true });

  assert.equal(result.selectedId, "hbd-1");
  assert.equal(result.changed, true);
  assert.equal(result.reason, "forced");
});

test("visible issues without a usable id are ignored", () => {
  const result = resolveSelection({
    visibleIssues: [{ title: "no id" }, { id: "hbd-7" }],
    selectedId: null
  });

  assert.equal(result.selectedId, "hbd-7");
});

test("details are loaded when the resolved selection differs from the current one", () => {
  assert.equal(
    shouldLoadDetails({ selectedId: "hbd-1", currentSelectedId: null }),
    true
  );
  assert.equal(
    shouldLoadDetails({ selectedId: "hbd-1", currentSelectedId: "hbd-2" }),
    true
  );
});

test("details are not reloaded for an unchanged selection unless forced", () => {
  assert.equal(
    shouldLoadDetails({ selectedId: "hbd-2", currentSelectedId: "hbd-2" }),
    false
  );
  assert.equal(
    shouldLoadDetails({ selectedId: "hbd-2", currentSelectedId: "hbd-2", forceReload: true }),
    true
  );
  assert.equal(
    shouldLoadDetails({ selectedId: null, currentSelectedId: "hbd-2" }),
    false
  );
});

test("an async result for a superseded selection is stale", () => {
  assert.equal(
    isStaleSelectionRequest({ requestedId: "hbd-1", currentSelectedId: "hbd-2" }),
    true
  );
  assert.equal(
    isStaleSelectionRequest({ requestedId: "hbd-1", currentSelectedId: "hbd-1" }),
    false
  );
  assert.equal(
    isStaleSelectionRequest({ requestedId: "hbd-1", currentSelectedId: null }),
    true
  );
});

test("highlight follows the selection and falls back to the first visible issue", () => {
  assert.equal(
    resolveHighlightId({ visibleIssues: issues, highlightedId: "hbd-2", selectedId: "hbd-2" }),
    "hbd-2"
  );
  assert.equal(
    resolveHighlightId({ visibleIssues: issues, highlightedId: null, selectedId: "hbd-2" }),
    "hbd-2"
  );
  assert.equal(
    resolveHighlightId({ visibleIssues: issues, highlightedId: "hbd-99", selectedId: "hbd-2" }),
    "hbd-2"
  );
  assert.equal(
    resolveHighlightId({ visibleIssues: issues, highlightedId: "hbd-99", selectedId: "hbd-98" }),
    "hbd-1"
  );
  assert.equal(resolveHighlightId({ visibleIssues: [], highlightedId: null, selectedId: null }), null);
});
