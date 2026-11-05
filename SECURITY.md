# Security

This mod is read-only and runs inside Herdr Desktop. Its security posture:

- **No shell execution.** Every `br`/`bv` call goes through Herdr's `exec(command, args, options)` with an explicit argument array. `ALLOWED_COMMANDS` is limited to `br` and `bv`; `bv` is never invoked without an explicit flag. No `ssh`, `eval`, `Function`, or `child_process` is used anywhere.
- **No tracker writes.** Only `br list`, `br ready`, `br show`, `br dep list`, `bv --version`, `bv --robot-next` and `bv --robot-triage` are issued. Issue IDs are validated against `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` before use.
- **No network by default.** Mermaid rendering is off by default. When enabled, only the source of a `mermaid` block is sent to `https://mermaid.ink`; the returned SVG is cached under the Herdr app home. Nothing else leaves the machine. The setting and its network note are shown in the settings view.
- **No HTML/JS injection.** Markdown is rendered by Herdr's native `TextView.markdown`; Mermaid diagrams are rendered as file-backed images, so SVG scripts do not execute. The mod never uses `innerHTML`.
- **Clipboard is sanitized.** "Copy issue ID" and "Copy issue reference" strip control characters, newlines, tabs, terminal escapes and bidi overrides, collapse whitespace and cap length before writing. The clipboard is only written on an explicit click and a transient notice confirms what was copied.
- **No prototype pollution.** Per-project state parsing drops `__proto__`, `constructor` and `prototype` keys and never throws on malformed input.
- **Cache paths are safe.** Cache filenames are derived from a hash of the diagram source plus a theme suffix; no user-controlled path component reaches the filesystem.

Found a problem? Open an issue at https://github.com/digi4care/herdr-beads-desktop/issues.