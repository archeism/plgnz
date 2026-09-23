# Personal → plgnz → Claude Code

Accepted source checkpoints: Personal `0ee9a0b`, plgnz `38aad2c`.
Terra implemented the Claude-only cutover; Sol independently reviewed it.

The isolated composition used Personal's neutral bundle in
`/tmp/claude-cutover-review.o90fym/bundle` and a fresh Claude root under
`/tmp/claude-cutover-review.o90fym/home/.claude`. The public CLI installed
karakeep, mattpocock, personal, toolbox, try-skill, and vercel. These are the
six Claude-eligible packages; Addy is excluded by Personal's allowlist.

The coordinator repeated public `plgnz list --json`, `plgnz doctor --json`,
and native `claude plugin list --json` against that isolated root after
refreshing the local launcher to the accepted commit. All six were present;
native Claude reported all six enabled. Doctor exited zero; raw output is
`/tmp/claude-cutover-review.o90fym/doctor-final.json`. The review used native
Claude Code 2.1.275. No auth files were copied or model calls made for this
composition check. Command execution evidence is separately recorded in
`claude-code-native-root-probe-20260922.json`.

Verification at acceptance:

- Core `bun run check` passed; `bun test`: 208 pass, zero fail, 841 assertions.
- Personal deployment and experiment-plugin checks passed.
- Personal Claude/public-client/host tests: 23 pass, one opt-in test skipped.
- Repeated the opt-in suite using the refreshed installed public launcher:
  `PERSONAL_PLGNZ_BIN=/Users/chaz/.local/bin/plgnz bun test tests/claude-cutover.test.ts`:
  four pass, zero fail. This exercises adoption without changing existing
  marketplace metadata in an isolated home.
- Independent review accepted root overrides, binary error/timeout handling,
  explicit adoption, canonical-source freshness, and stale-copy auditing.
- Personal's full check is **not green**: the untouched untracked
  `plugins/personal/skills/typesafe-ai` lacks required metadata/banner.
  Relevant migration checks pass; that unrelated skill remains unchanged.

The private Claude marketplace/install/update/reinstall branch is removed.
Personal retains bundling and selection; the public CLI owns native delivery.
No npm publication or fleet deployment occurred. Skills were not revised.

## Readback correction after acceptance

The coordinator's subsequent raw-output check found that public Claude `list`
omitted `enabled`, although Personal requires that boolean. Separate native
and public CLI checks had missed the consumer failure. The opt-in Personal
test now calls `installedPaths` through the actual CLI: it failed against
`38aad2c`, then passed after the reader included native user enablement from
`settings.json`. Native Claude confirmed explicit false and absent settings
entries both mean disabled. The regression checks all three states.

Sol independently reproduced RED against the old installed launcher and GREEN
against the candidate. Core verification: 209 tests, zero failures; typecheck
passed. Personal composition: four tests, zero failures, 16 assertions. This
supersedes the initial claim that the readback consumer had been fully checked.

## Live new-package distribution regressions

Adding `eval-skills` through `personal deploy` exposed two gaps not covered by the
fresh-home composition:

- The cache preflight recursively scanned unrelated native marketplaces and
  rejected an existing `CLAUDE.md` symlink in `oh-my-ai-sdk`. The scoped preflight
  now checks touched path components and selected content only; regression tests
  preserve the foreign symlink while rejecting redirected cache, metadata,
  wrapper and root paths, including dangling symlinks.
- A new member of an already-registered native marketplace must retain that
  registration when its selected native package and incoming package have
  identical staged contents. Existing unowned installations still require
  explicit adoption; differing source contents do not establish this proof.

The first fix passed `bun run check` and all 214 tests (882 assertions) before
its live retry exposed the second gap. Full deployment success is recorded below
only after a subsequent real retry, not inferred from these isolated tests.

The combined fix passed `bun run check` and all 215 tests (892 assertions).
A real `personal deploy` retry installed and enabled `eval-skills@personal` in
Claude's native cache and progressed through the Claude phase. The existing
`personal` marketplace registration and unrelated symlink were preserved.
The overall retry then stopped in Personal's Codex content-health consumer,
which incorrectly treated unrelated host-wide doctor failures as failure of the
selected plugin. This is separate from Claude installation success.

## Final live deployment outcome

With plgnz `74ce84f` installed locally and Personal `6d6578a`, the unmodified
`personal deploy` command exited **0**. It reported all local plugin phases and
managed-banner checks successful. Native readback found eight `eval-skills`
skills in Claude Code (enabled), Codex (enabled), and Cursor (installed; activation
is not claimed by the Cursor reader). Claude's own `plugin list --json` also
confirmed `eval-skills@personal` enabled. The existing native marketplace source
and unrelated `CLAUDE.md` symlink were preserved.

Additional migration fixes surfaced by the live retries:
- Personal evaluates the requested plugin's content findings, rather than using
  unrelated host-wide doctor failures as that plugin's health verdict.
- The old Vercel Codex-only build suffix was normalized in source. Explicit legacy
  adoption permits build-metadata-only native differences only with an exact
  cached canonical identity; replacement remains staged.
- Personal rejects legacy bare Kimi `0.x` versions, matching plgnz's native-plugin
  compatibility check. No Kimi upgrade was performed.

Final verification: plgnz type-check + 216 tests / 901 assertions; Personal's
focused real-public-client distribution suite 26 tests / 98 assertions. Personal's
aggregate source check still reports the pre-existing untracked `typesafe-ai`
metadata/banner issue; that content was left untouched. Full deployment success
is distinct from that source validation result. No npm release or remote fleet
rollout was performed; paused Grok/ZCode adapter edits remain uncommitted.
