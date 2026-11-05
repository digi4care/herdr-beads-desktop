const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 200;
const MAX_REFERENCE_LENGTH = 280;

// C0/C1 controls, DEL, line/paragraph separators and bidi overrides or isolates.
// Newlines and terminal escapes must never survive: pasting a copied reference into
// a shell or agent prompt must not start a new command line.
const UNSAFE_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * Collapse any text to one printable line with bounded length.
 *
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeSingleLine(value, maxLength = MAX_TITLE_LENGTH) {
  if (typeof value !== "string") return "";
  const flattened = value
    // Drop ANSI/terminal escape sequences first, then any stray control characters.
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, " ")
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, " ")
    .replace(UNSAFE_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  const limit =
    typeof maxLength === "number" && Number.isFinite(maxLength) && maxLength > 0
      ? Math.floor(maxLength)
      : MAX_TITLE_LENGTH;
  if (flattened.length <= limit) return flattened;
  return `${flattened.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/**
 * Format one issue reference for the clipboard: `ID — title` on a single line.
 * Returns `null` when there is no usable ID, so callers can report honestly instead
 * of copying an empty or partial reference.
 *
 * @param {{id?: unknown, title?: unknown}} [issue]
 * @returns {string|null}
 */
export function formatIssueReference(issue) {
  const id = sanitizeSingleLine(issue?.id, MAX_ID_LENGTH);
  if (!id) return null;
  const title = sanitizeSingleLine(issue?.title, MAX_TITLE_LENGTH);
  if (!title) return id;
  const reference = `${id} — ${title}`;
  return reference.length > MAX_REFERENCE_LENGTH
    ? `${reference.slice(0, MAX_REFERENCE_LENGTH - 1).trimEnd()}…`
    : reference;
}
