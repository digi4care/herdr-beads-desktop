---
sessionID: ses_e54c98eabffeWkdMpISUdXhgzm
baseMessageCount: 490
updatedAt: 2026-11-05T18:14:22.889Z
version: 1.0
date_created: 2026-11-05
owner: agent
tags: [spec, diagnostic]
consumedState: 88ce89ce4fa54d84f05acdd7ed8f9fa70fc11aad87565b0adebd36eae2df0df1
---

# laten we dan deze laatste stappen door nemen om het production uit te rollen en bij herdr https://herdr.dev/gallery/?type=mods aante melden

## Current spec

# Production rollout and Herdr gallery submission

## Goal
Roll out `herdr-beads-desktop` as a production-ready 0.1.0 mod and submit it to the Herdr gallery at https://herdr.dev/gallery/?type=mods.

## Current state
- Repo: https://github.com/digi4care/herdr-beads-desktop (public, main pushed).
- Version 0.1.0, author Chris Engelhard <chris@chrisengelhard.nl>.
- 185 unit/regression tests pass; `herdr-app check` passes for source and installed copy.
- SECURITY.md documents the read-only, no-shell, opt-in-Mermaid posture.
- All 19 child tickets and the milestone epic are closed.

## Open items for production
1. **License** — none chosen yet. README/CHANGELOG still say "license pending". MIT is the natural default for a public mod.
2. **Publishing metadata** — repository URL is set; final README/CHANGELOG cleanup.
3. **Gallery submission** — research in progress on the submission process, required files, review timeline.
4. **CI** — no automated pipeline yet; `npm test` + `herdr-app check` are manual.
5. **E2E** — GPUI view interaction is verified manually; automated E2E is not feasible in this environment.

## Security posture
- No shell execution; argv-only commands; allowlist `br`/`bv`.
- No tracker writes; no network unless Mermaid is explicitly enabled (off by default).
- Clipboard sanitized (single line, control chars stripped, length capped).
- No `innerHTML`/`eval`; SVG rendered as file-backed images.
- Cache filenames derived from a hash; no user-controlled path component.

## Success criteria
- License file committed and referenced in README.
- Final smoke test (`npm run smoke`) green.
- Gallery listing live or submission PR/issue opened per the researched process.
- No open child tickets.

## Assumptions
- Production means 0.1.0 public release, not a 1.0.0 stability claim.
- Gallery submission steps are pending research (in progress).

## Q&A history

Q: Which license should the published mod use?
A: MIT (Recommended)

Q: Should I add a GitHub Actions workflow that runs `npm test` and `herdr-app check` on every push?
A: Yes, add CI (Recommended)

Q: Should I now execute the rollout: add MIT LICENSE, add the CI workflow, finalize README/CHANGELOG, run the final smoke test, and push?
A: Yes, execute now (Recommended)
