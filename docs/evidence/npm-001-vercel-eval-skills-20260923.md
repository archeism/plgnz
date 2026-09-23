# npm 0.0.1 Vercel eval-skills probe · 2026-09-23

This is an installation and behavior probe, not a performance benchmark or a
claim that any skill changed.

## Frozen inputs

- Published `plgnz` `0.0.1`: npm tarball SHA-1
  `97234aa5a9c650c401908fe6f993d7818a2bb77b`; `npx` version check passed.
- Release workflow: [run 35845476621](https://github.com/archeism/plgnz/actions/runs/35845476621)
  completed successfully.
- Private fixture: `archeism/plgnz-eval-skills-probe` at
  `27a7496895a0d1319c81466a14ad768f72ddbad9`: 24 tracked files, eight skills,
  and 17 upstream skill files.
- Raw records persist at
  `/Users/chaz/.local/share/plgnz/evidence/20260923-eval-skills`.

## Vercel sandbox result

The isolated Node 22 sandbox used a unique home and exercised the published
`npx plgnz@0.0.1` route against the private Git fixture. OMP completed install,
re-add, doctor, native discovery of all eight skills, and removal. A GLM 5.3
interaction read both requested skills. The probe record is
`/tmp/plgnz-sandbox-probe/evidence-20260923-1790158013359.json`.

The minimal Node 22 image did not include `diff`; that is an image capability
fact, not a failed content comparison. No credential or environment value is
recorded here.

## Claude result and boundaries

Fresh-host discovery is intentionally conservative:

- Claude Code is present only when `~/.claude` exists or an explicit verified
  `OPEN_PLUGIN_CLAUDE_CODE_BIN` is supplied
  ([source](../../src/hosts/claude-code.ts)).
- OMP is present only when `~/.omp/plugins` exists
  ([source](../../src/hosts/omp.ts)).

Claude's remote standalone path remains unsupported: the Claude writer rejects
a non-absolute `resolved.sourceUri` before local marketplace registration
([source](../../src/hosts/claude-code-writer.ts)). A local clone is the current
supported user route. Claude Code 2.1.280 passed the local-clone route: add installed, re-add
unchanged, doctor clean, native plugin list enabled, and all eight installed
skill hashes equal the source. The GLM transcript contains successful `Skill`
invocations of `eval-skills:evals-start` followed by `eval-skills:eval-audit`,
and asks where the eval artifacts live. No `--plugin-dir` override was used.
The final record is `claude-local-20260923101855815-29230.jsonl` in the raw
record directory above.

The runner reported a false failure while summing per-assistant usage. Manual
review found aggregate usage in the terminal result instead: 6,509 input,
8,064 cache-read input, 0 cache-create, and 973 output tokens. The model phase
wall time was 26.462 seconds. This post-hoc interpretation does not rewrite the
failed runner record. Earlier attempts stopped on missing `diff` and a greedy
CLI option consuming the prompt; their evidence is preserved.

Both successful model trials returned successful removal by native ID and
stopped their fresh sandboxes. Claude's post-remove native-list/root-absence
check was skipped by the telemetry gate; OMP's separate filesystem check had
a shell-quoting defect. Therefore the evidence proves removal commands
succeeded, not an independently observed post-removal filesystem state.

## Measurements and limits

The OMP aggregate three-assistant-message run used 21,224 input tokens, 302 output
tokens, 40,576 cache-read tokens, 62,102 total tokens, and 16.787 s wall time.
The harness was `18.2.11` and the model was `glm-5.3`. These are aggregate run
measurements, not a final-message-only measurement or a performance result.

CPU and memory were not measured. The sandbox's default 2 vCPU / 4 GB shape is
not reported as observed resource usage. This is one sample, not a benchmark;
skills are unchanged and this carries no RSI claim.

The old persistent sandbox could not resume (HTTP 410 `snapshot_not_found`).
Fresh isolated sandboxes were used and stopped. No fleet deployment or skill
content changes were made. The first OMP run and the remote Claude refusal
remain recorded as failures, not silently replaced by the later local route.
