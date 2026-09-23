# Personal → plgnz → Cursor composition

This records two boundaries tested on 2026-09-23: the public Cursor host
lifecycle in `plgnz`, and Personal's use of that public lifecycle. All stores
were temporary. No real Cursor home, authentication material, deployment, or
model request was used.

## Core marketplace identity

The old Cursor writer recorded a marketplace package's ownership as the bare
native name (`personal`). Its reader could therefore return the local copy but
could not recover the `personal` marketplace identity. The marketplace
assertion in the new full-lifecycle regression is RED against that behavior.

The candidate records `personal@personal` in the ownership marker, reads that
identity back only from a valid marker, and accepts the old bare marker solely
for retry repair. The regression in `test/add.test.ts` uses a temporary Git
marketplace containing `personal`. It covers add, Cursor reader and public
`list --json`, public `doctor --json`, repair of an old bare-marker plus pending
marketplace-qualified ledger entry, unchanged re-add, same-version source
update, failed update retention, recovery, and removal. The isolated core
lifecycle fixture in `test/cursor-lifecycle.test.ts` separately checks staged
copying, native manifest identity, unchanged and same-version refresh,
conversion refusal retention, adoption, and owned cleanup.

Commands and results:

```sh
cd /Users/chaz/workspace/personal/open-plugin
bun test test/cursor-lifecycle.test.ts test/add.test.ts
# 32 pass, 0 fail, 175 assertions

bun test
# 210 pass, 0 fail, 868 assertions
```

The second command is the acceptance-suite result for the core candidate.

The two fake-child deployment gates explicitly clear an inherited
`PERSONAL_PLGNZ_BIN`, so their fixture `PATH` selects their own `plgnz` shim.
Both passed with no override and with the candidate override present:

```sh
cd /Users/chaz/personal
env -u PERSONAL_PLGNZ_BIN bun src/check-plugin-deploy.ts
PERSONAL_PLGNZ_BIN=/tmp/plgnz-cursor-candidate bun src/check-plugin-deploy.ts
env -u PERSONAL_PLGNZ_BIN bun src/check-skip-hermes.ts
PERSONAL_PLGNZ_BIN=/tmp/plgnz-cursor-candidate bun src/check-skip-hermes.ts
```

The deployment gate printed its four completion checks in both runs; the
Hermes gate printed `skip Hermes ok` in both. Captured deployment-gate output
is `/tmp/personal-final-native-gates/15.log` and
`/tmp/personal-final-native-gates/18.log`; the corresponding Hermes-gate
outputs are `15-skip.log` and `18-skip.log` in that directory.

## Personal composition and audit

Personal's opt-in fixture builds the canonical neutral collection at
`repo/dist/plgnz`, calls `deployCursorPlugins`, and uses the public candidate
binary for Cursor `list` and `doctor` readback. Its minimal runtime registry is
intentional: the fixture needs status/audit discovery without creating another
runtime profile.

```sh
cd /Users/chaz/personal
PERSONAL_PLGNZ_BIN=/tmp/plgnz-cursor-candidate bun test tests/cursor-cutover.test.ts
# 1 pass, 0 fail, 10 assertions
```

The fixture proves a fresh Cursor status, then changes the canonical
`SKILL.md` without rebuilding `dist/plgnz`; status becomes stale while the
audit still reports the installed Cursor copy. It then removes Cursor from the
current allowlist and confirms the audit still reports that installed copy.
This distinguishes current delivery policy and source freshness from factual
inspection of an existing native copy.

The direct isolated house proof is preserved at
`/tmp/personal-cursor-house-proof.json`. It called `deployCursorPlugins` twice
with the candidate public CLI and verified public `list` and `doctor` inside
the helper. Both calls returned the same six packages: `karakeep`,
`mattpocock`, `personal`, `toolbox`, `try-skill`, and `vercel`. The installed
copies contained respectively 2, 6, 23, 7, 6, and 2 skills. Its temporary
root was `/var/folders/ln/6t0ppxld6hs_md1clt2mvplw0000gn/T/personal-cursor-house-Vnqss9`.
The helper's return values intentionally hide per-package install statuses, so
this evidence does not claim that the second call returned `unchanged`; the
core regression above proves that state transition.

That house proof used the live local Personal tree, including the preserved
untracked `typesafe-ai` skill. It is a local amended-tree distribution proof,
not evidence that every bundled byte is tracked, clean-commit, or production
ready. Personal's broader full-check limitation remains unchanged.

## Runtime boundary

This is install, readback, content-freshness, and audit evidence. It does not
prove that the Cursor UI loaded these packages in a new session, selected a
skill, executed a command, or used any particular model. A prior isolated
Cursor Agent CLI `--mode ask` attempt was rejected for exhausted usage before a
transcript existed; that records a past quota limit, not current availability
or a model result.
