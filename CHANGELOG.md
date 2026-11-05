# Changelog

All notable changes to Herdr Beads Desktop are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project vision, product requirements, technical requirements, user stories, and brainstorm handoff.
- Read-only data parsers for `br list`, `br ready`, `br show`, `br dep list`, `bv --robot-next`, and `bv --robot-triage`.
- Node-based behavior tests for the data contracts.
- Project metadata for author Chris Engelhard and initial development version `0.1.0`.
- Native read-only Herdr panel with issue list, ready filter, details, dependencies, and BV actions.
- Conditional visibility for initialized Beads projects and optional BV detection.
- Focused workspace/tab/cwd tracking with regression tests for stale folders, tab switches, mod focus, and hidden-layout recovery.
- Real app validation of workspace and tab switching.
- Settings view (gear button) for font scale, button style, button content, detail rendering, and Mermaid, persisted per Herdr user under `beads-desktop:settings`.
- Colored priority, type, and status pills on issue rows; pills are display-only and never filter the list.
- Markdown rendering for issue details with a raw-source mode, plus `mermaid` fence rendering through mermaid.ink behind an explicit, default-off setting with a local SVG cache.
- Issue context menu on right-click, including opening details in a popup.
- Guard that closes an open popup before another one opens, so detail and board popups cannot nest.
- Full-color button variant whose hover and active shades are derived from the accent color, keeping the label readable at 4.5:1 or better.

### Fixed

- Right-click on an issue no longer throws: the context menu used the invalid `menuitem` role and now uses `menu_item`.
- Full-color buttons no longer become unreadable on hover: background and label were chosen independently, so dark text could land on a dark hover background. Solid state colors are now derived and checked with WCAG contrast on every theme.

### Pending

- Interactive validation of mouse issue selection and BV buttons.
- Final publishing metadata, including repository URL and license.

## Release policy

The package starts at `0.1.0`. During initial development (`0.x.y`), the public mod/data interfaces may change between minor versions. After `1.0.0`:

- **MAJOR** increments for incompatible public changes;
- **MINOR** increments for backward-compatible functionality;
- **PATCH** increments for backward-compatible fixes.

A version is released only after the relevant unit tests, `herdr-app check`, and real Herdr app validation pass. Git tags, commits, repository creation, and publication require explicit user authorization.
