# ADR-0007 — Replace AGENTS.md single-source with distil skill + MCP + config-merge

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)
- **Supersedes:** ADR-0005 (the `CLAUDE.md`/`AGENTS.md` single-source mechanism only —
  the rest of ADR-0005's decision, native hooks + MCP, still holds)

## Context

ADR-0005 decided `elgt init` would write `CLAUDE.md` into every new vault and symlink
`AGENTS.md` to it, so all agent CLIs share one canonical instruction file. Implementing
and dogfooding this surfaced three problems that conflict with EleGent's actual value
proposition ("your conversation gets remembered no matter which folder you're in"):

- **Archiving (hooks) has nothing to do with the vault's `CLAUDE.md`.** Hooks can run at
  user scope and archive from *any* project folder — but `CLAUDE.md` only makes sense
  when the agent's cwd *is* the vault. Most real conversations happen in unrelated
  project folders (each with their own `CLAUDE.md`), so forcing a librarian persona
  file into every vault conflated two unrelated concerns.
- **`skill-distil.md` was coupled to `CLAUDE.md`/`AGENTS.md`** — several instructions
  told the agent to "follow the tool commands in CLAUDE.md/AGENTS.md," so the skill
  wasn't self-contained.
- **User scope was effectively a no-op.** `bootstrap` skipped any file that already
  existed, and most users already have `~/.claude/settings.json`/`~/.codex/hooks.json`
  — so `init` silently installed nothing there. Combined with the old default scope
  being `project`, the "archive anywhere" pitch didn't actually hold out of the box.

## Decision drivers

- Same as ADR-0005: **ASR-3** (cheap per-CLI extensibility), **ASR-4** (don't ship
  unverified archiving), plus the newly-surfaced requirement that hooks must genuinely
  work at user scope by default.
- Retires **ASR-6** as originally worded (single source of truth via a shared
  `AGENTS.md`/`CLAUDE.md` file) — cross-CLI consistency is still a goal, just achieved
  a different way (see Decision). The ADL's ASR-6 entry has been updated to match.

## Options considered

1. **Keep the `AGENTS.md` symlink, just fix the scope-default/merge bugs.** *Cons:*
   doesn't solve the core mismatch — a vault-local persona file still has nothing to do
   with archiving conversations that happen in unrelated project folders.
2. **Drop the shared persona file; move agent behavior into the distil skill (per
   backend) + the MCP server's own `instructions` + idempotently-merged hooks config.**
   *Pros:* archiving and recall/curation become independent of any file the agent has
   to read from a specific cwd; user scope becomes real; re-running `init` is additive,
   not skip-or-nothing. *Cons:* loses the "one visible canonical file" mental model;
   consistency across backends now relies on the same skill content being symlinked
   into each backend's skill dir rather than one shared file.

We chose option 2.

## Decision

We will (a) **stop writing any persona file into the user's vault** — `elgt init` no
longer creates `CLAUDE.md`, `AGENTS.md`, or a root `.mcp.json`; (b) move recall/lookup
guidance into the `elegent-memory` MCP server's own `instructions` field (baked into the
binary, always present whenever an MCP client's cwd is the vault — no file needed); (c)
make the distil skill (`src/assets/skill-distil.md`, one file per backend via symlink)
self-contained — format rules, write contract, and entity Facts-table conventions all
live there instead of being deferred to `CLAUDE.md`; (d) make hooks/MCP config
installation **idempotently additive** (`src/core/application/config-merge.ts`:
`mergeClaudeSettings`/`mergeCodexHooks`/`mergeAgyHooks`/`mergeAgyMcpConfig`) so `init`
actually adds hook entries into a user's existing settings instead of skipping; (e)
change the **default scope to `user`** for all three agent CLIs, so archiving works
from any folder out of the box; (f) automate MCP registration by shelling out to the
official `claude mcp add` / `codex mcp add` CLIs (`src/infrastructure/adapters/
agent-cli.ts`), instead of hand-writing `.mcp.json`; Antigravity (no native `mcp add`)
gets its `~/.gemini/config/mcp_config.json` merged directly, user scope only.

This repo's own root `CLAUDE.md`/`AGENTS.md` (this file) are unaffected — they are this
repo's own dev-facing instructions, not something `elgt init` produces, and stay out of
scope for this decision (same carve-out ADR-0005 already made).

## Consequences

- **Positive:** archiving genuinely works at user scope out of the box (matches the
  actual pitch); the distil skill is self-contained and portable; MCP registration is
  delegated to the tools that own that state (`claude`/`codex` CLIs), so EleGent never
  drifts from their config schema; re-running `init` is safe (additive merge, not
  skip-or-overwrite).
- **Negative / costs accepted:** users lose the "one canonical `CLAUDE.md`" mental model
  from ADR-0005 — cross-CLI consistency is now implicit (same skill content symlinked
  per backend, same MCP `instructions` string) rather than one visible file; Antigravity
  MCP still isn't auto-registered outside user scope (same gap ADR-0005 left for `agy`,
  now explicit rather than "deferred").
- **Follow-up:** ADR-0005's remaining "Follow-up" item (Antigravity transcript parser +
  hook support) is no longer outstanding — `core/application/transcript/agy.ts` and
  `presentation/hooks/agy/hook.ts` were both completed as part of the same body of work
  that produced this decision.
