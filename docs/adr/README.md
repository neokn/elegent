# Architecture Decision Log (ADL)

The immutable history of EleGent's significant, hard-to-reverse architecture
decisions. One decision per record; accepted ADRs are never edited — when a
decision no longer holds we write a new ADR and mark the old one `Superseded by
ADR-N`. See each record for the full Context / Options / Decision / Consequences.

## Architecturally-Significant Requirements (ASR)

The quality attributes and constraints that drive the decisions below:

- **ASR-1 Prevent architectural erosion.** Backwards/hidden dependencies (a "core"
  module reaching into a delivery entry point) must be caught mechanically, not by
  review. This need surfaced from a real regression (`lib/bootstrap` importing
  `cli/scaffold`).
- **ASR-2 Testability.** Business logic must be unit-testable without a real
  filesystem, git, or agent-CLI runtime.
- **ASR-3 Extensibility across agent CLIs.** Adding a new agent CLI (Claude Code,
  Codex, later `agy`) must be cheap and localized — no shotgun edits, no core
  changes.
- **ASR-4 Archiving must not fail silently.** Hooks never block the host CLI (they
  swallow errors and exit 0), so a mis-wired path silently stops archiving. Correct
  wiring must be verified end-to-end.
- **ASR-5 Right-sizing.** This is a small, single-developer, single-bounded-context
  CLI tool. Decoupling must be tuned to that — full ceremony everywhere is
  over-engineering ("the map is not the territory").
- **ASR-6 Consistent cross-CLI behavior without coupling to a vault-local file.**
  Originally framed (ADR-0005) as "Claude reads `CLAUDE.md`, Codex/Antigravity read
  `AGENTS.md`, must not drift." ADR-0007 retired the shared-file mechanism itself
  (archiving must work from any folder, not just the vault) — consistency is now kept
  by symlinking the same `skill-digest.md` content into each backend's skill dir and
  sharing one MCP `instructions` string, not by one canonical persona file.

## Records

| ADR | Title | Status | Date | Supersedes |
|---|---|---|---|---|
| [0001](0001-adopt-explicit-architecture-with-ci-enforced-dependency-rule.md) | Adopt Explicit Architecture with a CI-enforced dependency rule | Accepted | 2026-07-08 | — |
| [0002](0002-pure-core-via-port-inversion.md) | Keep the Core pure by inverting all I/O behind injected ports | Accepted | 2026-07-08 | — |
| [0003](0003-thin-filestore-port-vs-domain-shaped-vaultstore.md) | Use a thin fs-shaped `FileStore` port instead of a domain-shaped `VaultStore` | Accepted | 2026-07-08 | — |
| [0004](0004-shared-archive-core-with-per-cli-parsers.md) | One shared archive core with per-CLI transcript parsers | Accepted | 2026-07-08 | — |
| [0005](0005-multi-agent-cli-integration-strategy.md) | Integrate agent CLIs via native hooks + AGENTS.md single-source + MCP | Superseded by ADR-0007 | 2026-07-08 | — |
| [0006](0006-ea-depth-tuned-to-single-bounded-context.md) | Tune EA folder depth to a single bounded context | Accepted | 2026-07-08 | — |
| [0007](0007-replace-agents-md-single-source-with-skill-mcp.md) | Replace AGENTS.md single-source with digest skill + MCP + config-merge | Accepted | 2026-07-08 | 0005 |

## Conventions

- Location: `docs/adr/NNNN-kebab-title.md`, numbered, appended never reordered.
- Status ∈ {Proposed, Accepted, Deprecated, Superseded by ADR-N}.
- To change a decision: add a new ADR, cross-link, flip the old Status. Do not edit
  the old record's Decision.
