# ADR-0003 — Use a thin fs-shaped `FileStore` port instead of a domain-shaped `VaultStore`

- **Status:** Accepted
- **Date:** 2026-07-08
- **Author:** Neo Kusanagi (with Claude)
- **Relates to:** ADR-0002

## Context

Explicit Architecture is emphatic that a port must be **shaped to the Core's
needs, never a mimic of a tool's API**. The port introduced in ADR-0002,
`FileStore` (`read`/`write`/`walkFiles`/`entries`/`symlink`/`mtimeMs`/`realpath`),
is close to a 1:1 renaming of `node:fs`. By the letter of EA it is a "tool-mimic"
port, not a domain-shaped one (which would read like
`VaultStore.writeNote(slug, note)` / `readNote` / `listNotes(para)`).

## Decision drivers

- Fidelity to EA's "shaped to the Core's needs" rule.
- **ASR-5** right-sizing / avoiding churn with no payoff.
- Two ports genuinely have a small, domain-shaped verb set; one does not.

## Options considered

1. **Domain-shape everything into a `VaultStore` with relative-slug methods.**
   *Pros:* textbook-faithful; hides the filesystem entirely. *Cons:* the tool's
   *only* driven dependency **is** the filesystem and will never be swapped;
   `indexgen`/`lint` are inherently directory-tree walks, so a domain wrapper would
   just re-expose tree walking under new names; re-plumbing every call site from
   absolute paths to root-relative slugs is high-churn, low-reward, and risky on a
   working, well-tested system.
2. **Keep a thin `FileStore` and document the trade-off.**
   *Pros:* minimal churn; the tree-walk operations stay honest; the deliberate
   deviation is recorded. *Cons:* objectively a tool-mimic port; `port-in-Core` is
   canonical in *location* but not in *shape*.
3. **Split by verb set:** domain-shape the ports whose verbs are naturally small
   and domain-specific; keep the file port thin.

## Decision

We will **keep `FileStore` a deliberately thin filesystem abstraction** (option 2)
and record it as a conscious trade-off in `core/ports.ts`, invoking EA's own
caveat *"tune the degree of decoupling to the system … the map is not the
territory."* Where domain-shaping is cheap and natural we **do** it (option 3):
`ProcessRunner` was reshaped into a domain `GitRunner`
(`init`/`stageAll`/`commit`/`diffNameStatus`) instead of a generic spawn wrapper,
and `CodexSessionLocator.locate(hookInput, cwd)` is fully domain-shaped.

## Consequences

- **Positive:** Core stays pure (ADR-0002) with low churn; the two small-verb ports
  are properly domain-shaped; the one broad tree-walking port is thin and honest;
  the deviation is documented, not silent.
- **Negative / costs accepted:** `FileStore` remains a tool-mimic port — a reader
  must not mistake "port lives in Core" for "port shaped to Core". If the tool ever
  needed a non-filesystem vault backend, this port would have to be reshaped first.
- **Follow-up:** revisit and supersede this ADR if a second vault backend or
  heavier vault semantics ever make a domain-shaped `VaultStore` pay for itself.
