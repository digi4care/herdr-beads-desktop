import test from "node:test";
import assert from "node:assert/strict";
import {
  countIssuesByStatus,
  defaultActiveStatuses,
  filterIssues,
  filterIssuesByStatus,
  formatStatusFilterSummary,
  isDefaultActiveStatusSelection,
  normalizeStatusKey,
  parseBrDependencies,
  parseBrList,
  parseBrReady,
  parseBrShow,
  parseBvNext,
  parseBvTriage,
  presentStatusEntries,
  resolveSelectedStatuses,
  SUPPORTED_STATUSES,
  sortIssues,
  toggleStatusFilter
} from "../mods/beads-desktop/data.js";

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

test("countIssuesByStatus returns zero counts for every supported status on an empty list", () => {
  const result = countIssuesByStatus([]);

  assert.equal(result.total, 0);
  assert.deepEqual(Object.keys(result.counts), [...SUPPORTED_STATUSES]);
  for (const status of SUPPORTED_STATUSES) {
    assert.equal(result.counts[status], 0);
  }
  assert.equal("unknown" in result.counts, false);
  assert.equal(result.ordered.length, SUPPORTED_STATUSES.length);
  assert.deepEqual(result.ordered.map((entry) => entry.status), [...SUPPORTED_STATUSES]);
});

test("countIssuesByStatus returns zero counts for every supported status on non-array input", () => {
  for (const input of [undefined, null, "issues", 42, {}]) {
    const result = countIssuesByStatus(input);

    assert.equal(result.total, 0);
    assert.deepEqual(Object.keys(result.counts), [...SUPPORTED_STATUSES]);
    for (const status of SUPPORTED_STATUSES) {
      assert.equal(result.counts[status], 0);
    }
    assert.equal(result.ordered.length, SUPPORTED_STATUSES.length);
  }
});

test("countIssuesByStatus counts mixed statuses with one custom and one missing status", () => {
  const result = countIssuesByStatus([
    { id: "a", status: "open" },
    { id: "b", status: "open" },
    { id: "c", status: "custom" },
    { id: "d" }
  ]);

  assert.equal(result.counts.open, 2);
  assert.equal(result.counts.custom, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.closed, 0);
  assert.equal(result.total, 4);
});

test("normalizeStatusKey normalizes progress, done and In-Progress style variants", () => {
  assert.equal(normalizeStatusKey("progress"), "in_progress");
  assert.equal(normalizeStatusKey("working"), "in_progress");
  assert.equal(normalizeStatusKey("done"), "closed");
  assert.equal(normalizeStatusKey("In-Progress"), "in_progress");
  assert.equal(normalizeStatusKey("  OPEN  "), "open");
  assert.equal(normalizeStatusKey("in progress"), "in_progress");
  assert.equal(normalizeStatusKey("unknown"), "unknown");
  assert.equal(normalizeStatusKey(""), "unknown");
  assert.equal(normalizeStatusKey(undefined), "unknown");
  assert.equal(normalizeStatusKey(7), "unknown");
});

test("countIssuesByStatus buckets status variants into their normalized keys", () => {
  const result = countIssuesByStatus([
    { id: "a", status: "progress" },
    { id: "b", status: "In-Progress" },
    { id: "c", status: "done" },
    { id: "d", status: "CLOSED" }
  ]);

  assert.equal(result.counts.in_progress, 2);
  assert.equal(result.counts.closed, 2);
  assert.equal(result.total, 4);
});

test("countIssuesByStatus orders supported statuses first and extras alphabetically", () => {
  const result = countIssuesByStatus([
    { id: "a", status: "zebra" },
    { id: "b", status: "apple" },
    { id: "c", status: "open" }
  ]);

  assert.deepEqual(result.ordered.map((entry) => entry.status), [
    ...SUPPORTED_STATUSES,
    "apple",
    "zebra"
  ]);
  assert.deepEqual(result.ordered.slice(0, SUPPORTED_STATUSES.length), SUPPORTED_STATUSES.map((status) => ({
    status,
    count: result.counts[status],
    supported: true
  })));
  assert.deepEqual(result.ordered.slice(SUPPORTED_STATUSES.length), [
    { status: "apple", count: 1, supported: false },
    { status: "zebra", count: 1, supported: false }
  ]);
});

test("countIssuesByStatus totals every input issue including unknown buckets", () => {
  const issues = [
    { id: "a", status: "open" },
    { id: "b", status: "mystery" },
    { id: "c" },
    { id: "d", status: "" }
  ];

  const result = countIssuesByStatus(issues);

  assert.equal(result.total, issues.length);
  assert.equal(result.counts.unknown, 2);
  assert.equal(result.counts.mystery, 1);
  assert.equal(result.counts.open, 1);
});

test("countIssuesByStatus counts the full issue list and not the filtered subset", () => {
  const issues = [
    { id: "a", status: "open" },
    { id: "b", status: "closed" },
    { id: "c", status: "open" }
  ];
  const ready = new Set(["c"]);

  const all = countIssuesByStatus(issues);
  const filtered = countIssuesByStatus(filterIssues(issues, ready, "ready"));

  assert.equal(all.total, 3);
  assert.equal(all.counts.open, 2);
  assert.equal(all.counts.closed, 1);
  assert.equal(filtered.total, 1);
  assert.equal(filtered.counts.open, 1);
  assert.equal(filtered.counts.closed, 0);
  assert.equal(all.counts.open, 2);
});

test("presentStatusEntries returns only statuses present in the loaded project in ordered sequence", () => {
  const issues = [
    { id: "1", status: "closed" },
    { id: "2", status: "open" },
    { id: "3", status: "open" },
    { id: "4", status: "custom_review" },
    { id: "5", status: "in-progress" }
  ];

  const present = presentStatusEntries(issues);
  assert.deepEqual(present, [
    { status: "open", count: 2, supported: true },
    { status: "in_progress", count: 1, supported: true },
    { status: "closed", count: 1, supported: true },
    { status: "custom_review", count: 1, supported: false }
  ]);
  assert.deepEqual(presentStatusEntries([]), []);
});

test("defaultActiveStatuses and resolveSelectedStatuses default to all non-closed statuses", () => {
  const issues = [
    { id: "1", status: "open" },
    { id: "2", status: "in_progress" },
    { id: "3", status: "blocked" },
    { id: "4", status: "closed" },
    { id: "5", status: "done" },
    { id: "6", status: "custom" }
  ];

  const defaults = defaultActiveStatuses(issues);
  assert.deepEqual([...defaults], ["open", "in_progress", "blocked", "custom"]);
  assert.deepEqual([...resolveSelectedStatuses(issues, null)], ["open", "in_progress", "blocked", "custom"]);
  assert.equal(isDefaultActiveStatusSelection(issues, null), true);
  assert.equal(isDefaultActiveStatusSelection(issues, ["open", "in_progress", "blocked", "custom"]), true);
  assert.equal(isDefaultActiveStatusSelection(issues, ["open", "closed"]), false);
});

test("toggleStatusFilter toggles statuses in multi-select and preserves normalized state without mutating input", () => {
  const issues = [
    { id: "1", status: "open" },
    { id: "2", status: "blocked" },
    { id: "3", status: "closed" }
  ];
  const snapshot = structuredClone(issues);

  // Starting from null (default Active: open + blocked), toggling closed adds closed
  const withClosed = toggleStatusFilter(issues, null, "closed");
  assert.deepEqual([...withClosed].sort(), ["blocked", "closed", "open"]);
  assert.equal(formatStatusFilterSummary(issues, withClosed), "All");

  // Toggling open removes open
  const withoutOpen = toggleStatusFilter(issues, withClosed, "open");
  assert.deepEqual([...withoutOpen].sort(), ["blocked", "closed"]);
  assert.equal(formatStatusFilterSummary(issues, withoutOpen), "2 states");

  // Toggling closed removes closed, leaving only blocked
  const onlyBlocked = toggleStatusFilter(issues, withoutOpen, "closed");
  assert.deepEqual([...onlyBlocked], ["blocked"]);
  assert.equal(formatStatusFilterSummary(issues, onlyBlocked), "blocked");

  // Toggling blocked removes blocked, leaving None
  const noneSelected = toggleStatusFilter(issues, onlyBlocked, "blocked");
  assert.deepEqual([...noneSelected], []);
  assert.equal(formatStatusFilterSummary(issues, noneSelected), "None");

  assert.deepEqual(issues, snapshot);
});

test("filterIssuesByStatus and filterIssues compose ready and multi-select status filtering", () => {
  const issues = [
    { id: "a", status: "open" },
    { id: "b", status: "in_progress" },
    { id: "c", status: "blocked" },
    { id: "d", status: "closed" }
  ];
  const readyIds = new Set(["a", "b", "d"]);

  // Default Active (selectedStatuses = null) excludes closed
  assert.deepEqual(
    filterIssuesByStatus(issues, null).map((i) => i.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    filterIssues(issues, readyIds, "active", null).map((i) => i.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    filterIssues(issues, readyIds, "ready", null).map((i) => i.id),
    ["a", "b"]
  );

  // Multi-select with closed + open
  const openAndClosed = new Set(["open", "closed"]);
  assert.deepEqual(
    filterIssues(issues, readyIds, "active", openAndClosed).map((i) => i.id),
    ["a", "d"]
  );
  assert.deepEqual(
    filterIssues(issues, readyIds, "ready", openAndClosed).map((i) => i.id),
    ["a", "d"]
  );
});

test("parseBvTriage rejects payloads without recommendations", () => {
  assert.throws(() => parseBvTriage(null), /missing recommendations/);
  assert.throws(() => parseBvTriage({}), /missing recommendations/);
  assert.throws(() => parseBvTriage({ triage: {} }), /missing recommendations/);
  assert.throws(() => parseBvTriage({ triage: { recommendations: "x" } }), /missing recommendations/);
});

test("parseBvNext rejects non-object payloads", () => {
  assert.throws(() => parseBvNext(null), /Invalid bv next output/);
  assert.throws(() => parseBvNext("x"), /Invalid bv next output/);
  assert.throws(() => parseBvNext(42), /Invalid bv next output/);
});

test("parseBvNext reports non-actionable when no recommendation is present", () => {
  const result = parseBvNext({ actionable: false, message: "none" });
  assert.equal(result.actionable, false);
  assert.equal(result.recommendation, null);
  assert.equal(result.message, "none");
});

test("parseBrDependencies rejects non-array payloads", () => {
  assert.throws(() => parseBrDependencies(null), /expected an array/);
  assert.throws(() => parseBrDependencies({}), /expected an array/);
});

test("parseBrReady rejects non-array payloads", () => {
  assert.throws(() => parseBrReady(null), /expected an array/);
  assert.throws(() => parseBrReady({}), /expected an array/);
});

test("formatStatusFilterSummary returns Active for the default selection", () => {
  const issues = [{ status: "open" }, { status: "closed" }];
  assert.equal(formatStatusFilterSummary(issues, null), "Active");
});

test("formatStatusFilterSummary returns All, None, single status, or count", () => {
  const issues = [{ status: "open" }, { status: "blocked" }, { status: "closed" }];
  assert.equal(formatStatusFilterSummary(issues, new Set(["open", "blocked", "closed"])), "All");
  assert.equal(formatStatusFilterSummary(issues, new Set()), "None");
  assert.equal(formatStatusFilterSummary(issues, new Set(["open"])), "open");
  assert.equal(formatStatusFilterSummary(issues, new Set(["open", "closed"])), "2 states");
});

test("filterIssuesByStatus with null keeps non-closed issues (Active)", () => {
  const issues = [{ status: "open" }, { status: "closed" }];
  const result = filterIssuesByStatus(issues, null);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "open");
});

test("filterIssuesByStatus filters by the resolved selection", () => {
  const issues = [{ status: "open" }, { status: "closed" }, { status: "open" }];
  const result = filterIssuesByStatus(issues, new Set(["open"]));
  assert.equal(result.length, 2);
  assert.ok(result.every((issue) => issue.status === "open"));
});

test("sortIssues returns a new array and leaves the input untouched", () => {
  const issues = [{ id: "a", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  const sorted = sortIssues(issues, "default");
  assert.notEqual(sorted, issues);
  assert.equal(issues.length, 1);
});

test("sortIssues default puts in_progress before open before blocked", () => {
  const issues = [
    { id: "b", priority: 2, status: "blocked", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "a", priority: 2, status: "in_progress", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "c", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" }
  ];
  const sorted = sortIssues(issues, "default");
  assert.deepEqual(sorted.map((i) => i.id), ["a", "c", "b"]);
});

test("sortIssues priority puts P0 before P4", () => {
  const issues = [
    { id: "low", priority: 4, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "high", priority: 0, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" }
  ];
  const sorted = sortIssues(issues, "priority");
  assert.deepEqual(sorted.map((i) => i.id), ["high", "low"]);
});

test("sortIssues newest sorts by createdAt descending", () => {
  const issues = [
    { id: "old", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "new", priority: 2, status: "open", createdAt: "2026-02-01", updatedAt: "2026-02-01" }
  ];
  const sorted = sortIssues(issues, "newest");
  assert.deepEqual(sorted.map((i) => i.id), ["new", "old"]);
});

test("sortIssues oldest sorts by createdAt ascending", () => {
  const issues = [
    { id: "old", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "new", priority: 2, status: "open", createdAt: "2026-02-01", updatedAt: "2026-02-01" }
  ];
  const sorted = sortIssues(issues, "oldest");
  assert.deepEqual(sorted.map((i) => i.id), ["old", "new"]);
});

test("sortIssues updated sorts by updatedAt descending", () => {
  const issues = [
    { id: "stale", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "fresh", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-02-01" }
  ];
  const sorted = sortIssues(issues, "updated");
  assert.deepEqual(sorted.map((i) => i.id), ["fresh", "stale"]);
});

test("sortIssues handles non-array input", () => {
  assert.deepEqual(sortIssues(null, "default"), []);
  assert.deepEqual(sortIssues(undefined, "default"), []);
});

test("sortIssues handles unknown mode by falling back to default", () => {
  const issues = [
    { id: "b", priority: 2, status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "a", priority: 2, status: "in_progress", createdAt: "2026-01-01", updatedAt: "2026-01-01" }
  ];
  const sorted = sortIssues(issues, "nonsense");
  assert.deepEqual(sorted.map((i) => i.id), ["a", "b"]);
});
