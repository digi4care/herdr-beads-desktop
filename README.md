# Herdr Beads Desktop

A native Herdr Desktop mod for **beads_rust (`br`)** and **beads_viewer (`bv`)**.

The mod is read-only: active issues, a ready filter, issue details rendered as markdown with a raw-source mode, direct dependencies, colored priority/type/status pills, and `bv` Next/Triage for the focused workspace and tab. Right-clicking an issue opens its context menu, and details can be opened in a popup.

## Requirements

This version is validated with Herdr Desktop 0.1.13, herdr-core 0.1.18, `br 0.7.6`, `bv 0.26.0`, and Linux. Other versions are not yet claimed as compatible.

## Development

```bash
npm test
herdr-app check mods/beads-desktop
```

Tests use Node's built-in `node:test`; no external packages are required.

## Installation

Copy only the mod directory, not the development documentation:

```bash
cp -a mods/beads-desktop ~/.config/herdr-app/mods/beads-desktop
herdr-app check ~/.config/herdr-app/mods/beads-desktop
```

If the destination already exists, do not overwrite it blindly: create a backup or choose a different mod name. Herdr reloads changes live. The mod appears as a right-side panel according to `mod.json`.

To remove the installed copy:

```bash
rm -rf ~/.config/herdr-app/mods/beads-desktop
```

Verify the path before removal and use this command only for your own mod copy.

## Conditional visibility

The mod follows the focused workspace, tab, and terminal working directory. It hides its own layout block in home directories, remote spaces, and other contexts where `br` cannot read an initialized Beads project. A successful `br` load shows the block again, including after hot reload or restart.

`br` is required for the functional panel. `bv` is optional: if `bv --version` fails, issue browsing remains available and BV actions are replaced by `BV unavailable`.

If you opened the mod as a temporary overlay, `Esc` or focus loss closes it. Reopen it with:

```bash
herdr-app do mod.open --name beads-desktop
```

## Settings

Open the settings view from the gear button in the panel header. Settings are stored for the Herdr user under the shared key `beads-desktop:settings`, so they apply to every project.

- **Font scale** — 0.9, 1 (default), or 1.15.
- **Button style** — ghost (default) or full color. In the full-color variant the hover and active shades are derived from the accent color, and the label keeps at least 4.5:1 contrast in every state.
- **Button content** — text or icons.
- **Details** — rendered markdown (default) or raw source.
- **Mermaid** — renders `mermaid` fenced blocks through mermaid.ink (off by default); see the network note below.

## Network use

The mod makes no network calls other than Mermaid rendering. **Mermaid is off by default.** When you turn it on, the source of a `mermaid` block in an issue detail is sent to `https://mermaid.ink`, and the returned SVG is cached in `mods/beads-desktop/.mermaid/` under the Herdr app home. Nothing else leaves the machine. With **Mermaid** off, the panel shows the diagram source together with the reason it was not rendered.

## Safety and scope

- No issue mutations, Git actions, or visible-mode automatic issue polling.
- Only argv-based read-only `br` commands and `bv --robot-next`/`--robot-triage`.
- While hidden, a lightweight context watcher and a read-only availability probe at most once every five seconds allow the mod to reappear.
- Never invoke bare `bv` from the mod: its interactive TUI would block the mod.
- Write actions, pane-specific behavior, and concurrent multi-repo support are out of scope.

## Versioning and publication

This project follows [Semantic Versioning](https://semver.org/). The current development version is `0.1.0`; releases and verification evidence are recorded in [CHANGELOG.md](CHANGELOG.md).

All public documentation, code comments, test names, error messages, and user-facing copy use English. Local development documents under `docs/` are intentionally excluded from Git publication.

Repository creation, Git tags, commits, and publication are not performed without explicit user authorization.

## Author

**Chris Engelhard** — [chris@chrisengelhard.nl](mailto:chris@chrisengelhard.nl) — GitHub: [@digi4care](https://github.com/digi4care)
