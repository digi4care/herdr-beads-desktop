export function resolveProjectContext({ focused = null, spaces = [] } = {}, previousContext = null) {
  const activeSpace = (Array.isArray(spaces) ? spaces : []).find((space) => space?.active) ?? null;
  const space = activeSpace ?? (Array.isArray(spaces) ? spaces : [])[0] ?? null;

  if (!space) {
    return {
      key: "none",
      supported: false,
      cwd: null,
      tabId: null,
      spaceId: null,
      spaceName: "No active space",
      reason: "Select a local Herdr space to view Beads issues.",
      machine: null
    };
  }

  const focusedInfo = focused ?? null;
  const focusedTabId =
    typeof focusedInfo?.tab === "string" && focusedInfo.tab ? focusedInfo.tab : null;
  const rawFocusedCwd =
    typeof focusedInfo?.cwd === "string" ? focusedInfo.cwd.trim() : "";

  const machine = space.machine ?? null;
  let cwd = rawFocusedCwd;
  let preservedKey = null;
  if (!cwd) {
    const preserve =
      previousContext &&
      previousContext.supported &&
      typeof previousContext.cwd === "string" &&
      previousContext.cwd.trim() &&
      previousContext.spaceId === space.id &&
      (previousContext.machine ?? null) === machine &&
      (focusedTabId === null ||
        previousContext.tabId === null ||
        previousContext.tabId === focusedTabId);
    if (preserve) {
      cwd = previousContext.cwd;
      preservedKey = previousContext.key;
    } else {
      cwd = typeof space.folder === "string" ? space.folder.trim() : "";
    }
  }

  if (!cwd) {
    return {
      key: `nofolder:${space.id}:${focusedTabId ?? ""}`,
      supported: false,
      cwd: null,
      tabId: focusedTabId,
      spaceId: space.id,
      spaceName: space.name || "Local space",
      reason: "The active space has no project folder configured.",
      machine
    };
  }

  return {
    key: preservedKey ?? `${machine ? "remote" : "local"}:${space.id}:${focusedTabId ?? ""}:${machine ?? ""}:${cwd}`,
    supported: true,
    cwd,
    tabId: focusedTabId,
    spaceId: space.id,
    spaceName: space.name || cwd,
    reason: null,
    machine
  };
}

export function resolveVisibilityAction(node, hiddenByMod, shouldHide) {
  const actualHidden = node?.hidden === true;

  if (shouldHide) {
    return actualHidden ? "none" : "hide";
  }

  if (actualHidden) {
    return "show";
  }

  return hiddenByMod ? "show" : "none";
}
