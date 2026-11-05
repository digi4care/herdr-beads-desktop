import test from "node:test";
import assert from "node:assert/strict";
import { formatIssueReference, sanitizeSingleLine } from "../mods/beads-desktop/issue-reference.js";

test("formatIssueReference renders one single-line ID and title reference", () => {
  assert.equal(
    formatIssueReference({ id: "hbd-e5u.11", title: "Add right-click action" }),
    "hbd-e5u.11 — Add right-click action"
  );
});

test("formatIssueReference never copies a newline, tab or terminal escape sequence", () => {
  const reference = formatIssueReference({
    id: "hbd-1",
    title: "rm -rf / #\nnow in a new line\r\nand\u001b[31mescaped\tand\u0007bell"
  });
  assert.ok(reference);
  assert.equal(reference.includes("\n"), false);
  assert.equal(reference.includes("\r"), false);
  assert.equal(reference.includes("\t"), false);
  assert.equal(reference.includes("\u001b"), false);
  assert.equal(reference.includes("\u0007"), false);
  assert.equal(reference, "hbd-1 — rm -rf / # now in a new line and escaped and bell");
});

test("formatIssueReference strips bidi overrides and line separators that can disguise text", () => {
  const reference = formatIssueReference({
    id: "hbd-2",
    title: "safe\u202eevil\u2028next\u2066isolate\u2069"
  });
  assert.equal(reference, "hbd-2 — safe evil next isolate");
});

test("formatIssueReference collapses whitespace runs and trims", () => {
  assert.equal(
    formatIssueReference({ id: "  hbd-3  ", title: "   many    spaces \n between  " }),
    "hbd-3 — many spaces between"
  );
});

test("formatIssueReference returns just the ID when the title is empty or unusable", () => {
  assert.equal(formatIssueReference({ id: "hbd-4", title: "" }), "hbd-4");
  assert.equal(formatIssueReference({ id: "hbd-4", title: " \n\t " }), "hbd-4");
  assert.equal(formatIssueReference({ id: "hbd-4", title: 42 }), "hbd-4");
  assert.equal(formatIssueReference({ id: "hbd-4" }), "hbd-4");
});

test("formatIssueReference returns null without a usable ID", () => {
  assert.equal(formatIssueReference(null), null);
  assert.equal(formatIssueReference(undefined), null);
  assert.equal(formatIssueReference({}), null);
  assert.equal(formatIssueReference({ id: "   ", title: "Title" }), null);
  assert.equal(formatIssueReference({ id: "\n\u001b", title: "Title" }), null);
  assert.equal(formatIssueReference({ id: 7, title: "Title" }), null);
});

test("formatIssueReference bounds the copied text length", () => {
  const reference = formatIssueReference({ id: "hbd-5", title: "x".repeat(500) });
  assert.ok(reference);
  assert.ok(reference.length <= 280, `Expected <= 280 chars, got ${reference.length}`);
  assert.ok(reference.endsWith("…"));
});

test("sanitizeSingleLine keeps non-control unicode intact", () => {
  assert.equal(sanitizeSingleLine("Bewaar émoji 🎯 en CJK 漢字"), "Bewaar émoji 🎯 en CJK 漢字");
  assert.equal(sanitizeSingleLine(null), "");
  assert.equal(sanitizeSingleLine(123), "");
  assert.equal(sanitizeSingleLine("a".repeat(10), 4), "aaa…");
});
