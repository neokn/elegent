# ADR-0002 — Keep the Core pure by inverting all I/O behind injected ports

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)
- **Relates to:** ADR-0001

## Context

After adopting the three EA blocks (ADR-0001), the Core still called `node:fs`,
`node:os` (`homedir`), and `Bun.spawn` directly (roughly 9 of ~18 Core modules did
I/O). "Core imports no Presentation/Infrastructure" was enforced, but "Core is
pure business logic" was not — the Core still depended on concrete tools, so it
could not be unit-tested without a real filesystem/git, and infrastructure
knowledge (Codex's `~/.codex/sessions` disk layout) was leaking into it.

## Decision drivers

- **ASR-2** testability without real fs/git/agent runtime.
- **ASR-1 / ASR-3** keep the Core insulated from tool churn.
- **ASR-5** the benefit must justify the churn for a small tool.

## Options considered

1. **Leave fs/spawn inline in the Core.**
   *Pros:* zero further work; tests already use temp dirs. *Cons:* Core not truly
   inner-layer; "pure core" unenforceable; infra knowledge (homedir, session
   layout) stays in Core.
2. **Full Ports & Adapters inversion:** define Core-owned ports, move every fs/spawn
   call into `infrastructure/` adapters, inject them from the Presentation
   composition root.
   *Pros:* Core becomes pure and unit-testable with an in-memory port; the rule can
   be enforced (`Core ↛ node:fs/os/Bun.spawn`); adding a backend touches no Core
   I/O. *Cons:* invasive — reshapes every I/O-touching module + its callers +
   tests; ports risk being tool-mimic (addressed in ADR-0003).

## Decision

We will invert all Core I/O behind Core-owned port interfaces defined in
`core/ports.ts` (`FileStore`, `GitRunner`, `CodexSessionLocator`), implement them
as secondary adapters in `infrastructure/adapters/` (`node-fs`, `node-git`,
`codex-sessions`), and inject them from the Presentation layer (hooks / CLI / MCP
are the composition roots). We will **add a third CI rule**: Core production code
must not import `node:fs` / `node:os` or call `Bun.spawn` (test files are exempt —
a test is a mini composition root). The Codex session-discovery (disk-layout
knowledge) moves out of the Core parser into the `codex-sessions` adapter.

## Consequences

- **Positive:** the Core is now pure — `bun test` can drive it with the real
  node adapters over a temp dir, or a fake in-memory `FileStore`; the "no fs/os in
  core" rule is enforced; `homedir`/session-layout knowledge is confined to
  infrastructure. Adding a backend adds an adapter, not a Core change.
- **Negative / costs accepted:** more plumbing — every Core use case now takes an
  injected port; call sites and tests grew a port argument; more indirection to
  read through. The ports partly mimic their tools (ADR-0003).
- **Follow-up:** ADR-0003 records the deliberate shape of those ports.
