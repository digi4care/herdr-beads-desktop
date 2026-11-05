import test from "node:test";
import assert from "node:assert/strict";
import { filterIssues, parseBrDependencies, parseBrList, parseBrReady, parseBrShow, parseBvNext, parseBvTriage } from "../mods/beads-desktop/data.js";

test("parseBrList normalizes the br 0.7.6 list shape and preserves pagination", () => {
  const result = parseBrList({
    issues: [{
      id: "mnc-123",
      title: "Native board",
      status: "open",
      priority: 1,
      issue_type: "feature",
      assignee: "chris",
      description: "Build the board",
      acceptance_criteria: "Validated in Herdr",
      labels: ["desktop"],
      dependency_count: 2,
      dependent_count: 3,
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-05T10:00:00Z"
    }],
    total: 201,
    has_more: true
  });

  assert.equal(result.total, 201);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.issues, [{
    id: "mnc-123",
    title: "Native board",
    status: "open",
    priority: 1,
    issueType: "feature",
    assignee: "chris",
    description: "Build the board",
    acceptanceCriteria: "Validated in Herdr",
    labels: ["desktop"],
    dependencyCount: 2,
    dependentCount: 3,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z"
  }]);
});

test("parseBrReady uses only IDs from the ready array", () => {
  const ready = parseBrReady([
    { id: "mnc-123", title: "Native board", status: "open" },
    { id: "mnc-456", title: "Tests", status: "open" }
  ]);

  assert.deepEqual([...ready].sort(), ["mnc-123", "mnc-456"]);
});

test("filterIssues filters ready exclusively by br ready IDs", () => {
  const issues = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ready = new Set(["c"]);

  assert.deepEqual(filterIssues(issues, ready, "active"), issues);
  assert.deepEqual(filterIssues(issues, ready, "ready"), [{ id: "c" }]);
});

test("parseBrShow reads the first issue from the br show array", () => {
  const detail = parseBrShow([{
    id: "mnc-123",
    title: "Native board",
    status: "open",
    priority: 1,
    issue_type: "feature",
    description: "Build the board",
    acceptance_criteria: "Validated in Herdr"
  }]);

  assert.equal(detail.id, "mnc-123");
  assert.equal(detail.description, "Build the board");
  assert.equal(detail.acceptanceCriteria, "Validated in Herdr");
  assert.deepEqual(detail.labels, []);
  assert.throws(() => parseBrShow([]), /no issue/i);
});

test("parseBrDependencies normalizes direct dependency relationships", () => {
  const dependencies = parseBrDependencies([{
    issue_id: "mnc-123",
    depends_on_id: "mnc-100",
    title: "Design first",
    status: "closed",
    type: "depends_on",
    priority: 2
  }]);

  assert.deepEqual(dependencies, [{
    issueId: "mnc-123",
    dependsOnId: "mnc-100",
    id: "mnc-100",
    title: "Design first",
    status: "closed",
    type: "depends_on",
    priority: 2
  }]);
});

test("parseBvNext reads a root recommendation and an honest empty state", () => {
  assert.deepEqual(parseBvNext({ actionable: false, message: "No proven actionable item available" }), {
    actionable: false,
    message: "No proven actionable item available",
    recommendation: null
  });

  const next = parseBvNext({
    id: "bv-msve",
    title: "Key Dispatch Architecture",
    score: 0.1832,
    reasons: ["Unblocks work"],
    unblocks: 0
  });
  assert.equal(next.actionable, true);
  assert.deepEqual(next.recommendation, {
    id: "bv-msve",
    title: "Key Dispatch Architecture",
    priority: null,
    score: 0.1832,
    reasons: ["Unblocks work"],
    unblocks: 0
  });
});

test("parseBvTriage normalizes and limits recommendations to three", () => {
  const recommendations = [1, 2, 3, 4].map((n) => ({
    id: `mnc-${n}`,
    title: `Issue ${n}`,
    priority: 1,
    score: n / 10,
    reasons: [`Reason ${n}`],
    unblocks_ids: ["a", "b"]
  }));

  const result = parseBvTriage({ triage: { recommendations } });
  assert.equal(result.length, 3);
  assert.equal(result[0].id, "mnc-1");
  assert.equal(result[0].priority, 1);
  assert.equal(result[0].unblocks, 2);
  assert.deepEqual(parseBvTriage({ triage: { recommendations: [] } }), []);
});
