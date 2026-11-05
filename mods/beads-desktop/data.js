function text(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeIssue(issue) {
  return {
    id: text(issue.id),
    title: text(issue.title),
    status: text(issue.status, "unknown"),
    priority: Number.isInteger(issue.priority) ? issue.priority : 4,
    issueType: text(issue.issue_type, "task"),
    assignee: text(issue.assignee),
    description: text(issue.description),
    acceptanceCriteria: text(issue.acceptance_criteria),
    labels: Array.isArray(issue.labels) ? issue.labels.filter((label) => typeof label === "string") : [],
    dependencyCount: count(issue.dependency_count),
    dependentCount: count(issue.dependent_count),
    createdAt: text(issue.created_at),
    updatedAt: text(issue.updated_at)
  };
}

function normalizeBvRecommendation(recommendation) {
  return {
    id: text(recommendation.id),
    title: text(recommendation.title),
    priority: Number.isInteger(recommendation.priority) ? recommendation.priority : null,
    score: typeof recommendation.score === "number" ? recommendation.score : null,
    reasons: Array.isArray(recommendation.reasons)
      ? recommendation.reasons.filter((reason) => typeof reason === "string")
      : [],
    unblocks: count(recommendation.unblocks ?? recommendation.unblocks_ids?.length)
  };
}

export function parseBvTriage(payload) {
  if (!payload?.triage || !Array.isArray(payload.triage.recommendations)) {
    throw new Error("Invalid bv triage output: missing recommendations.");
  }
  return payload.triage.recommendations.slice(0, 3).map(normalizeBvRecommendation);
}

export function parseBvNext(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid bv next output.");
  }
  const recommendation = text(payload.id) ? normalizeBvRecommendation(payload) : null;
  return {
    actionable: payload.actionable === true || recommendation !== null,
    message: text(payload.message),
    recommendation
  };
}

export function parseBrDependencies(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid br dep list output: expected an array.");
  }
  return payload.map((dependency) => ({
    issueId: text(dependency.issue_id),
    dependsOnId: text(dependency.depends_on_id),
    id: text(dependency.depends_on_id) || text(dependency.issue_id),
    title: text(dependency.title),
    status: text(dependency.status, "unknown"),
    type: text(dependency.type),
    priority: Number.isInteger(dependency.priority) ? dependency.priority : 4
  }));
}

export function parseBrShow(payload) {
  if (!Array.isArray(payload) || !payload[0] || !text(payload[0].id)) {
    throw new Error("Invalid br show output: no issue found.");
  }
  return normalizeIssue(payload[0]);
}

export function filterIssues(issues, readyIds, filter) {
  return filter === "ready" ? issues.filter((issue) => readyIds.has(issue.id)) : issues;
}

export function parseBrReady(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid br ready output: expected an array.");
  }
  return new Set(payload.map((issue) => text(issue.id)).filter(Boolean));
}

export function parseBrList(payload) {
  if (!payload || !Array.isArray(payload.issues)) {
    throw new Error("Invalid br list output: missing issues.");
  }
  return {
    issues: payload.issues.map(normalizeIssue),
    total: count(payload.total) || payload.issues.length,
    hasMore: payload.has_more === true
  };
}
