# ADR-0004 — One shared archive core with per-CLI transcript parsers

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)

## Context

Each supported agent CLI archives conversations through the same pipeline —
*read a transcript → parse it into a common shape → write it to
`vault/palace/raw/conversations/<slug>/<date>_<sid>.md`*. Only the transcript
**format** differs (Claude JSONL vs Codex rollout JSONL vs, later, `agy`). The
first Codex integration was written as a self-contained module that **copied ~90%
of the Claude archive logic** (frontmatter assembly, path building, empty-markdown
guard, date handling), and the two sides were named asymmetrically: Claude's code
had generic names (`render.ts`, `archive.ts`, `countUserMessages`) while Codex's
was explicitly `codex`-named. This duplicates the load-bearing write logic per CLI
and hides which generically-named files are actually Claude-only.

## Decision drivers

- **ASR-3** add a new agent CLI cheaply, with no duplicated write logic.
- Symmetry / readability: same-role code should be named the same way.

## Options considered

1. **One self-contained module per CLI (name-by-CLI monolith).**
   *Pros:* "everything for CLI X in one file". *Cons:* permanently duplicates the
   archive writer across every backend; a bug fix must be applied N times; this is
   exactly what produced the initial 90%-copy defect.
2. **Extract a shared, format-agnostic archive core; each CLI provides only a
   format parser + a small descriptor.**
   *Pros:* the write logic exists once; per-CLI difference collapses to one
   `ArchiveDescriptor` (source scheme, tags, description prefix); parsers are
   same-shaped peers so adding a CLI = adding one parser. *Cons:* one more
   indirection; requires renaming the Claude side to be symmetric.

## Decision

We will extract a **format-agnostic archive core** — `core/application/transcript/
transcript.ts` (`RenderedTranscript` VO + `renderTurns` + `writeConversationArchive`)
— and keep, per CLI, only a **named parser** that translates its own transcript
format into `RenderedTranscript`: `core/application/transcript/{claude,codex}.ts`.
Backend differences are a single `ArchiveDescriptor` data object. We will name
same-role code symmetrically across CLIs (`renderClaudeTranscript` ↔
`renderCodexTranscript`, etc.), and eliminate the generically-named-but-Claude-only
modules. These parsers are anti-corruption translators (pure, no I/O) and therefore
stay in the Core — they are **not** called "adapters" (that term is reserved for
Infrastructure/Presentation).

## Consequences

- **Positive:** the archive writer exists exactly once; adding an agent CLI is one
  parser file; naming is symmetric so role is legible; the ~90% duplication is
  removed.
- **Negative / costs accepted:** an extra layer of indirection between a hook and
  the bytes on disk; the shared writer stays neutrally named (not `archiveClaude`),
  which we justify because renaming the shared core per-CLI would re-introduce the
  duplication this ADR removes.
