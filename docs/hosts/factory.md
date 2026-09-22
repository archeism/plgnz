# Factory / Droid — audit only

Factory is one of the five frozen standalone plugin-skill routes (`SPEC.md`
§ Compatibility and lifecycle requirements). It has no active plgnz adapter:
`src/consumer-profiles.ts` registers `factory` as `pending`. Consequently,
`add` and `update` report `unverified` without host-store or ledger mutation.
`remove` has no registered adapter and returns a target-selection failure.

## Verified

- Installed Droid is `/Users/chaz/.local/bin/droid`, version `0.180.0`, SHA-256
  `b0c55798cca081c72856f216fbbec21e0f5b28bc6d3856d992e0d059cadde1c5`.
- Its `droid --help` output identifies it as Factory's terminal coding agent.
- Static extraction from that binary (`strings -a
  /Users/chaz/.local/bin/droid`) contains both ordinary skill roots:
  `<repo>/.factory/skills/<name>/SKILL.md` and
  `~/.factory/skills/<name>/SKILL.md`.
- The same binary contains a frontmatter schema with `user-invocable` (default
  `true`) and `disable-model-invocation` (default `false`), and maps both into
  parsed skill metadata. This proves acceptance and representation only.
- Personal's existing standalone fan-out is separate legacy evidence, not a
  plgnz adapter: `/Users/chaz/personal/src/cli/deploy.ts` lists
  `~/.factory/skills`, links generated skills through
  `~/.local/share/personal/skills`, and prunes only marked/owned stale entries.

## Unverified

No model request or home mutation was made for this audit. There is no runtime
proof that either invocation flag changes Factory behavior, nor of the explicit
skill invocation spelling, argument delivery, automatic-selection exclusion,
or resource and sibling-reference loading. `droid --help` documents no
skill-specific slash-command surface; that absence is not proof that one is
unsupported. The older Personal harness inventory records a Factory discovery
probe blocked by authentication (`/Users/chaz/personal/deploy/harnesses.yaml`).

No metadata may be silently stripped or declared incompatible from this audit.
A future adapter must demonstrate the relevant native reader and lifecycle,
then preserve every required command/skill semantic under `SPEC.md` § Profiles
and conversion; unsupported semantics must be visible per-package outcomes.
