# Codex dogfood hook design

## Goal

Record Codex conversations created while developing EleGent into this repository's disposable local `vault/`, restoring Codex dogfooding without changing `elgt init` behavior for users.

## Scope

Add a repository-local `.codex/hooks.json`. Do not install a user-level hook, change vault templates, alter Core behavior, or register MCP servers.

## Design

The hook configuration registers two Codex lifecycle events:

- `Stop` invokes `src/presentation/hooks/codex/stop.ts`. The existing hook archives only when the session contains new user messages since its last save.
- `PreCompact` invokes `src/presentation/hooks/codex/precompact.ts`. The existing hook archives unconditionally before context compaction.

Each command resolves the Git root at runtime, sets `ELEGENT_ROOT` to that root, sets `ELEGENT_VAULT_NAME` to `vault`, and runs the TypeScript entrypoint with Bun. This matches the repository's source-level Claude dogfood setup and keeps the configuration valid from subdirectories.

The resulting data flow is:

`Codex lifecycle event` → `.codex/hooks.json` → Codex presentation hook → Codex session locator → transcript renderer/archive use case → `vault/pensieve/ankipan/conversations/` → index regeneration.

## Error handling and trust

Existing Codex hook code catches failures, appends diagnostic information to the EleGent hook log when possible, and returns success so archiving cannot block a Codex turn. The configuration supplies a 30-second timeout and a visible archiving status message.

Because project hooks are trust-gated by Codex, the developer must review and trust the new definitions with `/hooks` after the file is added. Changed hook definitions may require renewed trust.

## Verification

Verification will confirm:

1. `.codex/hooks.json` parses as JSON and contains exactly the intended `Stop` and `PreCompact` commands.
2. Existing Codex hook unit/integration tests pass.
3. A synthetic Codex rollout passed through the real entrypoint is archived into a temporary vault.
4. The broader test suite still passes if proportionate runtime permits.

## Non-goals

- Persisting this repository's local `vault/` in Git.
- Capturing conversations from other repositories.
- Adding `SessionStart`, `SessionEnd`, or unsupported Codex lifecycle events.
- Changing transcript format, save throttling, indexing, distillation, or MCP behavior.
