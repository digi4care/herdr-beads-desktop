const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const MERMAID_FENCE_OPEN = /^ {0,3}```[ \t]*mermaid[ \t]*$/i;
const ANY_FENCE = /^ {0,3}```/;

function splitLines(text) {
  return String(text).split(/\r\n|\r|\n/);
}

function isBlank(line) {
  return line.trim().length === 0;
}

function stripBlankEdges(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && isBlank(lines[start])) start += 1;
  while (end > start && isBlank(lines[end - 1])) end -= 1;

  return lines.slice(start, end).join("\n");
}

function trimOneTrailingNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export function splitMermaidBlocks(markdown) {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return [];
  }

  const lines = splitLines(markdown);
  const segments = [];
  let markdownLines = [];
  let inOtherFence = false;

  const flushMarkdown = () => {
    const text = stripBlankEdges(markdownLines);
    markdownLines = [];
    if (text.length > 0) {
      segments.push({ type: "markdown", text });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (inOtherFence) {
      if (ANY_FENCE.test(line)) inOtherFence = false;
      markdownLines.push(line);
      continue;
    }

    if (MERMAID_FENCE_OPEN.test(line)) {
      flushMarkdown();

      const sourceLines = [];
      let closed = false;
      let cursor = index + 1;

      while (cursor < lines.length) {
        if (ANY_FENCE.test(lines[cursor])) {
          closed = true;
          break;
        }
        sourceLines.push(lines[cursor]);
        cursor += 1;
      }

      segments.push({
        type: "mermaid",
        text: trimOneTrailingNewline(sourceLines.join("\n"))
      });

      index = closed ? cursor : lines.length;
      continue;
    }

    if (ANY_FENCE.test(line)) {
      inOtherFence = true;
    }
    markdownLines.push(line);
  }

  flushMarkdown();

  return segments;
}

export function hasMermaidBlocks(markdown) {
  return splitMermaidBlocks(markdown).some((segment) => segment.type === "mermaid");
}

export function encodeMermaidSource(source) {
  const bytes = new TextEncoder().encode(typeof source === "string" ? source : String(source ?? ""));

  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index];
    const byte2 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const byte3 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    encoded += BASE64_ALPHABET[(chunk >> 18) & 63];
    encoded += BASE64_ALPHABET[(chunk >> 12) & 63];
    encoded += index + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : "";
    encoded += index + 2 < bytes.length ? BASE64_ALPHABET[chunk & 63] : "";
  }

  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function mermaidSvgUrl(source, options = {}) {
  const dark = Boolean(options && options.dark);
  const theme = dark ? "dark" : "default";
  return `https://mermaid.ink/svg/${encodeMermaidSource(source)}?theme=${theme}`;
}

export function hashString(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  let hash = 5381;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

export function mermaidCacheKey(source, options = {}) {
  const dark = Boolean(options && options.dark);
  const text = typeof source === "string" ? source : String(source ?? "");
  return `mermaid-${hashString(text + (dark ? "\u0000dark" : "\u0000light"))}`;
}

export function parseSvgViewBox(svg) {
  if (typeof svg !== "string" || svg.length === 0) return null;

  const match = svg.match(/viewBox\s*=\s*["']([^"']*)["']/i);
  if (!match) return null;

  const parts = match[1].trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) return null;

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  const [x, y, width, height] = numbers;
  if (width <= 0 || height <= 0) return null;

  return { x, y, width, height };
}

export function computeSvgDisplaySize(svg, maxWidth, options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const minWidth = Number.isFinite(safeOptions.minWidth) ? safeOptions.minWidth : 80;
  const fallbackHeight = Number.isFinite(safeOptions.fallbackHeight)
    ? safeOptions.fallbackHeight
    : 180;
  const safeMaxWidth = Number.isFinite(maxWidth) ? maxWidth : 0;

  const viewBox = parseSvgViewBox(svg);
  if (!viewBox) {
    return {
      width: Math.round(safeMaxWidth),
      height: Math.round(fallbackHeight)
    };
  }

  const aspect = viewBox.width / viewBox.height;
  const lowerBound = Math.min(minWidth, safeMaxWidth);
  let width = Math.min(viewBox.width, safeMaxWidth);
  width = Math.min(Math.max(width, lowerBound), safeMaxWidth);

  return {
    width: Math.round(width),
    height: Math.max(1, Math.round(width / aspect))
  };
}
