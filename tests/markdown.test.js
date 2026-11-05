import test from "node:test";
import assert from "node:assert/strict";
import {
  splitMermaidBlocks,
  hasMermaidBlocks,
  encodeMermaidSource,
  mermaidSvgUrl,
  hashString,
  mermaidCacheKey,
  parseSvgViewBox,
  computeSvgDisplaySize
} from "../mods/beads-desktop/markdown.js";

test("splitMermaidBlocks returns an empty array for empty or whitespace-only markdown", () => {
  assert.deepEqual(splitMermaidBlocks(""), []);
  assert.deepEqual(splitMermaidBlocks("   \n\t\n"), []);
  assert.deepEqual(splitMermaidBlocks(undefined), []);
  assert.deepEqual(splitMermaidBlocks(null), []);
});

test("splitMermaidBlocks keeps plain markdown as a single markdown segment", () => {
  const result = splitMermaidBlocks("# Title\n\nSome text\n");
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "markdown");
  assert.equal(result[0].text, "# Title\n\nSome text");
});

test("splitMermaidBlocks splits one mermaid block out of surrounding text", () => {
  const result = splitMermaidBlocks("before\n```mermaid\ngraph TD;\n```\nafter");
  assert.equal(result.length, 3);
  assert.equal(result[0].type, "markdown");
  assert.equal(result[0].text, "before");
  assert.equal(result[1].type, "mermaid");
  assert.equal(result[1].text, "graph TD;");
  assert.equal(result[2].type, "markdown");
  assert.equal(result[2].text, "after");
});

test("splitMermaidBlocks handles multiple mermaid blocks", () => {
  const result = splitMermaidBlocks(
    "a\n```mermaid\ngraph TD;\nA-->B;\n```\nb\n```mermaid\ngraph LR;\n```\nc"
  );
  assert.deepEqual(
    result.map((segment) => segment.type),
    ["markdown", "mermaid", "markdown", "mermaid", "markdown"]
  );
  assert.equal(result[1].text, "graph TD;\nA-->B;");
  assert.equal(result[3].text, "graph LR;");
});

test("splitMermaidBlocks leaves non-mermaid fences inside the markdown text", () => {
  const result = splitMermaidBlocks("```js\nconst a = 1;\n```\ntext");
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "markdown");
  assert.ok(result[0].text.includes("```js"));
  assert.ok(result[0].text.includes("const a = 1;"));
});

test("splitMermaidBlocks detects the fence case-insensitively", () => {
  const result = splitMermaidBlocks("```MERMAID\ngraph TD;\n```");
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "mermaid");
  assert.equal(result[0].text, "graph TD;");
});

test("splitMermaidBlocks allows spaces after the fence and up to three leading spaces", () => {
  const spaced = splitMermaidBlocks("``` mermaid\ngraph TD;\n```");
  assert.equal(spaced.length, 1);
  assert.equal(spaced[0].type, "mermaid");

  const indented = splitMermaidBlocks("   ```mermaid\ngraph TD;\n   ```");
  assert.equal(indented.length, 1);
  assert.equal(indented[0].type, "mermaid");
  assert.equal(indented[0].text, "graph TD;");
});

test("splitMermaidBlocks treats an unterminated mermaid fence as one mermaid segment", () => {
  const result = splitMermaidBlocks("intro\n```mermaid\ngraph TD;\nA-->B;");
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "markdown");
  assert.equal(result[0].text, "intro");
  assert.equal(result[1].type, "mermaid");
  assert.equal(result[1].text, "graph TD;\nA-->B;");
});

test("splitMermaidBlocks normalizes CRLF line endings", () => {
  const result = splitMermaidBlocks("a\r\n```mermaid\r\ngraph TD;\r\n```\r\nb");
  assert.equal(result.length, 3);
  assert.equal(result[1].type, "mermaid");
  assert.equal(result[1].text, "graph TD;");
  assert.ok(!result[1].text.includes("\r"));
});

test("splitMermaidBlocks never emits empty markdown segments", () => {
  const result = splitMermaidBlocks("```mermaid\ngraph TD;\n```\n```mermaid\ngraph LR;\n```");
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "mermaid");
  assert.equal(result[1].type, "mermaid");
  for (const segment of result) {
    assert.ok(segment.text.length > 0);
  }
});

test("hasMermaidBlocks detects mermaid fences", () => {
  assert.equal(hasMermaidBlocks("plain text"), false);
  assert.equal(hasMermaidBlocks(""), false);
  assert.equal(hasMermaidBlocks("```mermaid\ngraph TD;\n```"), true);
  assert.equal(hasMermaidBlocks("```js\nconst a = 1;\n```"), false);
});

test("encodeMermaidSource produces base64url without padding", () => {
  assert.equal(encodeMermaidSource("graph TD;"), "Z3JhcGggVEQ7");
  assert.equal(encodeMermaidSource("héllo"), "aMOpbGxv");
  assert.equal(encodeMermaidSource("😀"), "8J-YgA");
  assert.equal(encodeMermaidSource("ÿÿ"), "w7_Dvw");
  assert.equal(encodeMermaidSource(""), "");
  assert.ok(!encodeMermaidSource("graph TD;").includes("="));
  assert.ok(!encodeMermaidSource("graph TD;").includes("+"));
  assert.ok(!encodeMermaidSource("graph TD;").includes("/"));
});

test("encodeMermaidSource is deterministic", () => {
  assert.equal(encodeMermaidSource("graph TD;"), encodeMermaidSource("graph TD;"));
});

test("mermaidSvgUrl builds mermaid.ink urls per theme", () => {
  assert.equal(
    mermaidSvgUrl("graph TD;"),
    "https://mermaid.ink/svg/Z3JhcGggVEQ7?theme=default"
  );
  assert.equal(
    mermaidSvgUrl("graph TD;", { dark: true }),
    "https://mermaid.ink/svg/Z3JhcGggVEQ7?theme=dark"
  );
});

test("hashString returns a deterministic 8 character hex string", () => {
  assert.match(hashString("abc"), /^[0-9a-f]{8}$/);
  assert.equal(hashString("abc"), hashString("abc"));
  assert.equal(hashString(""), "00001505");
  assert.equal(hashString("a"), "0002b606");
  assert.equal(hashString("abc"), "0b885c8b");
  assert.notEqual(hashString("abc"), hashString("abd"));
});

test("mermaidCacheKey is stable, theme-aware and a safe filename", () => {
  const key = mermaidCacheKey("graph TD;");
  assert.equal(key, mermaidCacheKey("graph TD;"));
  assert.match(key, /^mermaid-[0-9a-f]{8}$/);
  assert.notEqual(key, mermaidCacheKey("graph TD;", { dark: true }));
  assert.match(mermaidCacheKey("graph TD;", { dark: true }), /^mermaid-[0-9a-f]{8}$/);
});

test("parseSvgViewBox parses the common attribute variants", () => {
  assert.deepEqual(parseSvgViewBox('<svg viewBox="0 0 100 50">'), {
    x: 0,
    y: 0,
    width: 100,
    height: 50
  });
  assert.deepEqual(parseSvgViewBox("<svg viewBox='0,0,100,50'>"), {
    x: 0,
    y: 0,
    width: 100,
    height: 50
  });
  assert.deepEqual(parseSvgViewBox('<svg viewBox="  -10.5 , 2.25 , 120 , 60 "></svg>'), {
    x: -10.5,
    y: 2.25,
    width: 120,
    height: 60
  });
  assert.equal(parseSvgViewBox("<svg></svg>"), null);
  assert.equal(parseSvgViewBox(""), null);
  assert.equal(parseSvgViewBox(undefined), null);
});

test("computeSvgDisplaySize preserves aspect and clamps the width", () => {
  const size = computeSvgDisplaySize('<svg viewBox="0 0 200 100"></svg>', 600);
  assert.deepEqual(size, { width: 200, height: 100 });

  const clamped = computeSvgDisplaySize('<svg viewBox="0 0 200 100"></svg>', 120);
  assert.deepEqual(clamped, { width: 120, height: 60 });

  const small = computeSvgDisplaySize('<svg viewBox="0 0 10 10"></svg>', 600);
  assert.deepEqual(small, { width: 80, height: 80 });

  const fallback = computeSvgDisplaySize("<svg></svg>", 300);
  assert.deepEqual(fallback, { width: 300, height: 180 });

  const custom = computeSvgDisplaySize("<svg></svg>", 300, { fallbackHeight: 90 });
  assert.deepEqual(custom, { width: 300, height: 90 });
});
