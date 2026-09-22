# Implementation contract

This contract freezes issues #4–#10 before implementation. It applies to the five current plgnz adapters and the 16 current Personal routes only.

## Sources and identity

`add <source>` accepts an explicit local plugin root or collection, or an explicit Git source. `--plugin <name>` is repeatable and selects named packages from a collection before target activation. A local source is materialized from its supplied bytes. In particular, a Personal bundle is authoritative: plgnz must not fetch, replace, or normalize away its amended vendor bytes or provenance. Remote fetch occurs only for a remote input.

Discovery returns one or more `PluginSource` values with `dir`, `name`, optional `version`, optional `marketplace`, and optional `contentFingerprint`; `ResolvedSource` carries normalized `sourceUri`, `sha`, `isGit`, and `plugins`. A collection with zero packages is a required failure. Duplicate package/native identities, unknown requested plugins, unknown or absent requested targets, and unknown CLI flags are required failures before active writes. Selection does not change the source marketplace identity; each resulting install record retains the selected package's native identity.

## Outcome and CLI

```ts
type InstallStatus = 'installed' | 'unchanged' | 'unsupported' | 'unverified' | 'failed';
type InstallOutcome = {
  plugin: string;
  target: string;
  status: InstallStatus;
  dryRun: boolean;
  diagnostic?: string;
  nativeId?: string;
  action?: 'install' | 'update' | 'remove';
};
```

`--json` writes only `InstallOutcome[]` to stdout; human logs use stderr. A valid dry run returns the planned terminal status with `dryRun: true` and changes no active store or record. Invalid inputs are `failed`, never a dry-run success. Multi-target runs may mix outcomes and exit nonzero if any required target fails. `doctor` stays reader-only.

Mutation verbs (`add`, `update`, `remove`) emit outcomes; removal uses `action: 'remove'`. Read verbs (`list`, `doctor`) retain their existing host-native JSON shapes and accept repeated `--target` filters. A profile gates only the semantics it cannot evidence: it must not label an entire requested host `unverified` when the requested operation is supported.

`plgnz --version --json` emits `{ "name": "plgnz", "version": <package version> }` so callers can verify the pinned CLI before mutation.

## Records, staging, and refresh

Each owned installation record preserves its existing `host`, `id`, `source`, `sourceSha`, `installedAt`, and optional sorted `pins` fields. Additive optional `fingerprint` and `ownership` fields support content refresh and owned cleanup. `ownership` identifies only plgnz-created representations eligible for replacement or removal. A `pending: 'install' | 'remove'` intent is atomically persisted before its host mutation and cleared only after successful activation and ledger finalization. Interrupted work remains visible in `list` and `doctor` and is retried through the same mutation verb; no recovery daemon or global transaction is implied.

New records also retain the selected canonical `sourceDir` and an `installedFingerprint` captured from the activated host-native tree. Doctor's content check recomputes raw-byte fingerprints for both paths. It reports fresh only when the native install is present and enabled, neither tree changed, and no mutation is pending. Legacy records without complete byte proof are unverified; missing, changed, or unreadable source/native bytes are stale. This byte proof is independent of the source-revision freshness check: a matching Git head alone never proves installed content.

Adapters stage converted content, validate the staged representation, then activate it. A conversion/validation failure retains the active owned representation. Re-add is `unchanged` only when the selected source, target representation, and content fingerprint match. Changed local bytes refresh even when version and source revision do not. `update` reuses the record's source/selection, refreshes only owned artifacts, and reapplies recorded pins. `remove` refuses unrecorded artifacts.

Codex cache slots carry a `.plgnz-install.json` marker with their source identity, plugin id, and fingerprint. An explicit add may mark an unowned slot without `--adopt-existing` only when every staged byte already matches. Replacing a differing unowned slot requires `--adopt-existing`, a matching cached manifest name/version, and no foreign version that would remain active. Malformed markers and markers for another source are always refused. Cleanup failure after activation leaves the new active slot and pending ledger intent intact; it never deletes the new slot in an attempted rollback.

## Profiles and conversion

A `ConsumerProfile` names one frozen SPEC target, surface, observed-or-unverified version, evidence path, and capability status. `src/consumer-profiles.ts` is the typed registry for exactly the sixteen routes named in `SPEC.md`; it is intentionally wider than the active host reader/writer registries. Its capabilities include install, update, command projection, and user-only-skill behavior. CLI and desktop profiles remain distinct. A profile with missing runtime evidence returns `unverified`; a known incompatible semantic returns `unsupported`; neither activates a partial install. `add` and `update` admit only their selected target's operation capability, so an unrelated unverified command or resource semantic does not reject an ordinary supported install. A declared target without an active adapter returns a per-package `unverified` outcome and performs no host or ledger mutation; a name outside the frozen inventory remains an unknown-target failure. `targets --json` retains its detected-host id array; `targets --all --json` additively emits the complete profile objects.

Conversion accepts Markdown/TOML commands and skill directories only when it preserves name, description, explicit-invocation restriction, supported arguments, sibling references, and plugin-owned resources. Relative references may be rewritten only with path containment checks and a tested destination mapping. Executable handlers, permission semantics, and template preprocessing are refused when the target lacks a proven equivalent. Ordinary skills retain automatic discovery. No generic authoring manifest is added.

## First increment and verification record

The first code increment is the bundled Addy → Codex path (nine commands, 25 skills): diagnostics/source, conversion/staging, lifecycle, then native transcript. Each increment starts RED, records the focused command/output and saved action/result, and stays releasable. A native evidence record includes profile/version, source identity/fingerprint, selected target, transcript/readback, elapsed time, and failures. At `0.0.x`, releases are patch-only; no npm publication or fleet rollout is in scope.
