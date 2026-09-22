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
