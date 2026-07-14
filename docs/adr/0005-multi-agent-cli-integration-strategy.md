# ADR-0005 — Integrate agent CLIs via native hooks + AGENTS.md single-source + MCP

- **Status:** Superseded by [ADR-0007](0007-replace-agents-md-single-source-with-skill-mcp.md)
  (the `AGENTS.md` single-source part of decision (b) below only — native hooks + MCP,
  decisions (a)/(c), still hold as implemented)
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)

## Context

EleGent must let several agent CLIs (Claude Code, Codex CLI, later Antigravity
`agy`) auto-archive their conversations into the vault and read the project's
instructions. Investigation against each tool's real behaviour (verified locally
and against docs / the installed binaries) established:

- Each CLI has a **lifecycle hook that runs an external command** and passes the
  transcript location on stdin — Claude Code and Codex use the *same* hooks JSON
  schema (`event → matcher? + hooks[]`); Codex additionally requires the project
  `.codex/` layer to be **trusted** (`/hooks`) before hooks run.
- **Codex reads only `AGENTS.md`**, never `CLAUDE.md`; Claude Code reads `CLAUDE.md`.
- Codex's transcript is a rollout JSONL under `~/.codex/sessions` whose schema we
  verified against a real file; Antigravity's `agy` transcript format could **not**
  be verified (binary not installed, schema undocumented).
- The `elegent-memory` MCP server is a delivery-neutral way for any MCP client to
  read the vault, independent of hooks.

## Decision drivers

- **ASR-3** cheap per-CLI extensibility.
- **ASR-6** one source of truth for cross-CLI instructions (no drift).
- **ASR-4** don't ship a parser we cannot verify (would archive nothing or wrong).

## Options considered

1. **Bespoke integration per CLI**, duplicating instruction files and archive
   glue. *Cons:* drift between `CLAUDE.md`/`AGENTS.md`; duplicated logic (see
   ADR-0004).
2. **Reuse each CLI's native hook schema + one canonical instruction file + the
   shared archive core + MCP.** *Pros:* one archive pipeline; one instruction
   source; MCP gives read access even without hooks. *Cons:* per-CLI caveats to
   document (Codex hook-trust); some CLIs can't be fully supported yet.

## Decision

We will (a) generate each CLI's **native hook config** (`.claude/settings.json`,
`.codex/hooks.json`) driving the shared archive core; (b) make **`AGENTS.md` a
symlink to `CLAUDE.md`** so Codex/Antigravity and Claude read one canonical file
(single source of truth, zero drift); (c) offer the **`elegent-memory` MCP server**
for read access; (d) **defer Antigravity** archiving until its transcript format
can be verified — its context (`AGENTS.md`) and MCP paths are ready, but no parser
will be shipped unverified. We document the **Codex hook-trust** requirement so
users know hooks won't fire until trusted.

## Consequences

- **Positive:** adding Codex reused the exact Claude hook schema; one instruction
  file for all CLIs; MCP works regardless of hook support; no unverified code ships.
- **Negative / costs accepted:** the symlink is a mild cross-platform caveat
  (Windows without symlink support gets a warning, not a copy); Codex users must
  trust hooks manually; Antigravity is intentionally incomplete (context + MCP
  only) until a real `agy` transcript is available.
- **Follow-up:** to finish Antigravity, add one parser
  (`core/application/transcript/agy.ts`) + one locator adapter
  (`infrastructure/adapters/agy-sessions.ts`) + an `.agents/hooks.json` template —
  the shape mirrors Codex (ADR-0004).
