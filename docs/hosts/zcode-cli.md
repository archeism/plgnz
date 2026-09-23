# ZCode CLI — official target

`zcode-cli` means the official Z.ai CLI from
[zai-org/ZCode](https://github.com/zai-org/ZCode), not the community
`kingsword09/zcode-cli` / `zcode-app-cli` distribution.

## Source baseline

- Pinned source: `872ad960de7ec172591f7e1952f7849229f94521` (checked 2026-09-23).
- Agent CLI and runtime: `apps/zcode-cli/`; CLI package: `@zcode/cli`.
- Official build instructions: [README.en.md](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/README.en.md).
- CLI plugin documentation: [apps/zcode-cli/README.md](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/README.md).
- Isolated native evidence: [official CLI probe](https://github.com/archeism/plgnz/blob/main/docs/evidence/zcode-official-cli-872ad960-20260923.json).
- The official GitHub releases API returned no releases at this check. This
  establishes a source-build verification route, not the absence of distribution
  through other official channels.

`scripts/zcode-distribution/runner.mjs` is the Web distribution runner: it
handles `--web`, serve, and version behavior. It is not the terminal CLI
adapter. Build the terminal Agent CLI with `pnpm --filter @zcode/cli... build`,
then run `node apps/zcode-cli/packages/cli/dist/zcode.cjs --help`.

## Acceptance boundary

The pinned official build passed isolated marketplace install, update,
failed-update preservation, and removal probes. It also exposes a
`disable-model-invocation` skill in its loader-visible skill list. Therefore a
user-only skill must be represented as a command excluded from skill discovery.
The tested projection preserves a static resource reference as an absolute owned
path. It does not establish template preprocessing or argument expansion.

The isolated build used Node `26.7.0`, while the source declares Node `24.14.0`.
It establishes observed behavior, not supported-runtime certification.

Public plgnz adapter lifecycle and invocation conformance remain unverified.
Do not activate the pending adapter until its own complete matrix covers install,
re-add, changed-content update, failed-update preservation, removal, command
arguments/resources, and user-only exclusion against this official build.

The prior community-wrapper probes and its unregistered adapter draft do not
satisfy this gate. Preserve useful fixtures, but revalidate every runtime claim.
Desktop is a separate target; neither CLI source availability nor a CLI pass
proves Desktop compatibility. Do not replace an existing community executable
or reuse its live data directory merely to perform these probes.
