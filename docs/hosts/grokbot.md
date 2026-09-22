---
summary: Verified Grok Bot skill-home boundary and a deliberately narrow adapter proposal.
---

# Grok Bot

This is **Grok Bot** (`com.anysphere.sand`), not the `grok` Grok Build CLI.
The configured shared host is `cursor` (`box`), whose house checkout is
`/home/box/personal` and whose agent state is under `/home/box/agent-data`.

## What is verified

- Personal's Grok Bot target is the optional catalog
  `~/agent-data/workflows` (`archeism/personal:src/cli/deploy.ts`). Personal never creates that
  directory. When it exists, `personal deploy` copies each projected standalone
  skill there and refreshes the copy on the next deploy.
- A catalog entry must be a real directory containing `SKILL.md`. A skill-dir
  symlink is not catalogued; `archeism/personal:src/check-skill-homes.ts` exercises this and
  protects copy refresh plus owned stale-copy pruning.
- The copied tree is a standards-only, plugin-prefixed projection. Canonical
  source remains under `plugins/*/skills`; the deployment resource root for an
  entry is its own workflow directory, e.g.
  `~/agent-data/workflows/personal-inbox/`. Whether the loader uses that as a
  relative-resource base remains unverified.
- The host's ordinary installer state and the Grok Bot loader have not been
  live-probed in this audit. The local macOS app is version 0.57.1; its client
  bundle exposes workflow-management RPCs but contains no readable
  `agent-data/workflows` filesystem-loader contract.

## Invocation contract: unknown, do not infer

| Surface | Status |
| --- | --- |
| Ordinary model-selected skill | Unknown: catalog discovery does not prove prompt injection or selection. |
| User-only / implicit exclusion | Unknown: no supported frontmatter key or live control exists. |
| Slash command | Unknown: the client has slash-menu UI, but no verified mapping from workflow skill to a slash command. |
| Arguments | Unknown: no verified syntax, forwarding rule, or parser. |
| Nested resources | Unknown: copying preserves them; loader resolution relative to `SKILL.md` has not been established. |

`archeism/personal:deploy/harnesses.yaml` must remain `evidence.class: none` for `grokbot` until
the actual loader is read or a controlled host probe verifies each asserted
surface. The `cursor` SSH route was unavailable to this audit, so it supplied
no source evidence.

## Proposed adapter (not implemented)

Keep the current generic standalone-skill route, but make its ownership explicit
as a `copy-home` lifecycle adapter:

1. **Discover** only an existing catalog root; absence is an inactive optional
   route, never an instruction to create host state.
2. **Materialize/refresh** an owned projected skill as a real directory under
   `<root>/<qualified-name>`, with its resource base equal to that directory.
3. **Prune** only entries proved owned by the route; preserve unrelated native
   Grok Bot workflows.
4. **Verify** filesystem shape separately from loader behavior: real directory
   plus `SKILL.md` is the current proof; catalog appearance and every invocation
   surface require a fresh-session host probe.

This adapter deliberately owns deployment lifecycle only. It must not invent an
invocation flag, slash alias, argument grammar, or resource resolver before the
Grok Bot loader establishes one.

## Sources

- `archeism/personal:src/cli/deploy.ts`: `GROKBOT_SKILL_HOME`, optional-home activation,
  copy materialization, and owned pruning.
- `archeism/personal:src/check-skill-homes.ts`: executable fixture for the real-directory and
  copy-refresh invariants.
- `archeism/personal:deploy/harnesses.yaml`: the current evidence classification and limitations.
- `archeism/personal:plugins/personal/skills/machine-local/references/cursor/host.md`: shared
  Grok Bot host and source-location pointer.
