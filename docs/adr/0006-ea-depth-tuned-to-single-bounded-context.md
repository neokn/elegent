# ADR-0006 — Tune EA folder depth to a single bounded context

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)
- **Relates to:** ADR-0001

## Context

Graça's Explicit Architecture prescribes a specific second-level layout inside the
Core — `Component/<Context>/{Application, Domain}`, `Port/<tool>/`,
`SharedKernel/` — and an Infrastructure split *by tool-type then vendor*. EleGent
is a **single-bounded-context** tool (the one context is "the memory vault"),
built and maintained by one developer. After adopting the blocks (ADR-0001), the
Core was still a **flat pile** of ~14 modules — "package by module", which the EA
audit (against Graça's reference repo) flagged as the smell EA corrects. The
question is *how much* of the canonical second level to apply without
over-packaging a tiny tool.

## Decision drivers

- **ASR-1** the Domain→Application dependency direction is load-bearing and worth
  encoding.
- **ASR-5** right-sizing: EA's own rule is *"tune the degree of decoupling … the map
  is not the territory,"* and *"don't create a folder to put just one class in it."*

## Options considered

1. **Copy the full canonical layout** (`Component/<Context>/`, `Port/<tool>/`,
   `SharedKernel/`, Infrastructure `<tool-type>/<vendor>/`).
   *Pros:* maximally faithful to the reference. *Cons:* with one context, one vendor
   per tool, and no cross-context events, every one of those folders is an empty
   shell wrapping a single occupant — ceremony with no architectural payoff.
2. **Stay flat.** *Pros:* no work. *Cons:* the Domain↔Application boundary — the one
   part that carries a real dependency rule — stays invisible; the flat pile is hard
   to navigate.
3. **Apply only the layers that carry a rule; skip the single-context ceremony.**

## Decision

We will split the Core's second level into **`core/domain/`** (pure rules/VOs, zero
external dependencies) and **`core/application/`** (use cases, all I/O via ports),
with `ports.ts` and `version.ts` at the Core boundary, and an
`application/transcript/` feature slice for the inter-dependent archive core +
parsers. We will **deliberately omit** the single-context ceremony:
`Component/<Context>/` (one context → an empty wrapper), `Port/<tool>/` and
Infrastructure `<vendor>/` sub-namespaces (one vendor each), and `SharedKernel/`
(no cross-context events). Infrastructure stays `adapters/` (the port
implementations) plus named driven-helper modules (`state`, `autodigest`) — no
`helpers/` dumping ground. `presentation/` stays grouped by UI type
(`cli`/`hooks`/`mcp`), with `hookio` under `hooks/` (only hooks use it).

## Consequences

- **Positive:** the Domain←Application boundary is now visible and, combined with
  the CI rules (ADR-0001/0002), enforced; the Core is navigable; no empty-shell
  folders. Structure grows *by need* — if a second context or per-subject grouping
  ever earns its keep, it can be added then.
- **Negative / costs accepted:** the layout deviates from a literal reading of the
  reference repo (documented here as intentional); a contributor expecting the full
  canonical tree must read this ADR to understand the omissions.
