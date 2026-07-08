# ADR-0001 — Adopt Explicit Architecture with a CI-enforced dependency rule

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)

## Context

EleGent began as a flat `tools/` tree (`cli/`, `lib/`, `hooks/`, `mcp/`). As
multi-agent-CLI support (Codex on top of Claude Code) grew, the structure started
to erode: a genuine backwards dependency appeared — `tools/lib/bootstrap.ts`
imported `tools/cli/scaffold.ts`, i.e. a core-logic module reached into a CLI
entry point. The layering was "package by technical role", which does not encode
*which direction dependencies may point*, so nothing stopped the regression and
tests stayed green through it.

## Decision drivers

- **ASR-1** prevent architectural erosion (the trigger).
- **ASR-3** extensibility across agent CLIs without shotgun edits.
- **ASR-5** right-sizing — a small single-dev tool must not drown in ceremony.

## Options considered

1. **Keep the flat structure, rely on code review.**
   *Pros:* zero churn. *Cons:* the regression already slipped through review;
   dependency direction remains unexpressed and unenforced.
2. **Add only a CI dependency-lint on the current folders.**
   *Pros:* cheap; catches the erosion. *Cons:* the folder names (`cli/lib/hooks`)
   don't express the intended layering, so the rule is expressible but the code
   doesn't "scream" the architecture; readers can't see the boundary.
3. **Adopt Explicit Architecture (Graça): three top-level blocks
   Core / Presentation / Infrastructure with dependencies pointing inward,
   enforced in CI.**
   *Pros:* the folder layout *is* the architecture; the dependency rule is both
   visible and mechanically enforced; matches the design work already done.
   *Cons:* a large one-time rename; risk of over-packaging a tiny tool (mitigated
   by ADR-0006).

## Decision

We will restructure the source tree (then `tools/`, later renamed `src/`) into the
three Explicit Architecture blocks —
`core/` (Application Core), `presentation/` (User Interface / driving side),
`infrastructure/` (driven side) — with cross-block imports via `@core` /
`@presentation` / `@infrastructure` path aliases, and we will **enforce the
inward-only dependency rule as a test** (`src/architecture.test.ts`) so a
forbidden import fails `bun test` (and therefore the build), not merely a review.

The enforced rules: Core must not import Presentation or Infrastructure;
Infrastructure must not import Presentation; (see ADR-0002 for the third rule).

## Consequences

- **Positive:** dependency direction is now a compiled fact, not a convention; the
  `bootstrap → scaffold` class of regression fails the build. The structure
  communicates the architecture to any reader. Aliases make imports
  location-independent, so later moves are cheap.
- **Negative / costs accepted:** a large mechanical rename (mitigated: aliases mean
  code imports don't hard-code block paths); the path-based dogfood hook configs
  (`.claude/settings.json`, `.codex/hooks.json`) must be kept in sync with file
  moves or hooks silently fail (**ASR-4**) — every structural move is now followed
  by an end-to-end hook verification.
- **Follow-up:** ADR-0002 (pure core), ADR-0006 (how deep to package for one
  context). The test file `src/architecture.test.ts` is the single source of
  truth for the rule.
