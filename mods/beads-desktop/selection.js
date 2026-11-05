/**
 * Pure selection helpers for the Beads desktop mod.
 *
 * These helpers never mutate state and never perform async work. They only
 * compute the decision that the caller should apply, so a late async result
 * can never silently overwrite a newer user selection.
 */

/** Keep only issues that carry a usable string id. */
function normalizeVisible(visibleIssues) {
  if (!Array.isArray(visibleIssues)) return [];
  return visibleIssues.filter(
    (issue) => typeof issue?.id === "string" && issue.id.length > 0
  );
}

/**
 * Decide which issue should be selected for the current visible list.
 *
 * @param {object} options
 * @param {Array<{id: string}>} [options.visibleIssues] Issues passing the active filter.
 * @param {string|null} [options.selectedId] Currently selected issue id, if any.
 * @param {boolean} [options.force] True for initial load / context change: always
 *   take the first visible issue instead of preserving the current selection.
 * @returns {{selectedId: string|null, changed: boolean, reason: "empty"|"preserved"|"first-visible"|"forced"}}
 */
export function resolveSelection({
  visibleIssues = [],
  selectedId = null,
  force = false
} = {}) {
  const visible = normalizeVisible(visibleIssues);

  if (visible.length === 0) {
    return {
      selectedId: null,
      changed: false,
      reason: "empty"
    };
  }

  const firstId = visible[0].id;

  if (!force && typeof selectedId === "string" && visible.some((issue) => issue.id === selectedId)) {
    return {
      selectedId,
      changed: false,
      reason: "preserved"
    };
  }

  return {
    selectedId: firstId,
    changed: firstId !== (selectedId ?? null),
    reason: force ? "forced" : "first-visible"
  };
}

/**
 * Whether the caller should (re)load details for the resolved selection.
 *
 * @param {object} options
 * @param {string|null} options.selectedId Resolved selection id.
 * @param {string|null} options.currentSelectedId Id currently loaded in the details pane.
 * @param {boolean} [options.forceReload] Reload even when the id did not change (ordinary refresh).
 * @returns {boolean}
 */
export function shouldLoadDetails({
  selectedId = null,
  currentSelectedId = null,
  forceReload = false
} = {}) {
  if (typeof selectedId !== "string" || selectedId.length === 0) return false;
  if (selectedId !== currentSelectedId) return true;
  return forceReload === true;
}

/**
 * Guard against stale async results: a detail request that was started for a
 * different issue than the one currently selected must not be applied.
 *
 * @param {object} options
 * @param {string|null} options.requestedId Issue the async request was started for.
 * @param {string|null} options.currentSelectedId Currently selected issue id.
 * @returns {boolean} True when the request result is stale and must be dropped.
 */
export function isStaleSelectionRequest({
  requestedId = null,
  currentSelectedId = null
} = {}) {
  if (typeof requestedId !== "string" || requestedId.length === 0) return true;
  return requestedId !== (currentSelectedId ?? null);
}

/**
 * Resolve the keyboard highlight for the current visible list.
 *
 * @param {object} options
 * @param {Array<{id: string}>} [options.visibleIssues] Issues passing the active filter.
 * @param {string|null} [options.highlightedId] Current highlight.
 * @param {string|null} [options.selectedId] Current selection.
 * @returns {string|null}
 */
export function resolveHighlightId({
  visibleIssues = [],
  highlightedId = null,
  selectedId = null
} = {}) {
  const visible = normalizeVisible(visibleIssues);
  if (visible.length === 0) return null;

  if (
    typeof highlightedId === "string" &&
    visible.some((issue) => issue.id === highlightedId)
  ) {
    return highlightedId;
  }

  if (
    typeof selectedId === "string" &&
    visible.some((issue) => issue.id === selectedId)
  ) {
    return selectedId;
  }

  return visible[0].id;
}
