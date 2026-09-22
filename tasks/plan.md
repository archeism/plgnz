# plgnz as Personal’s plugin distributor

Execution status and issue dependencies are tracked in the [GitHub milestone](https://github.com/archeism/plgnz/milestone/1); [tasks/todo.md](todo.md) is its local index.

## Outcome

Personal retains vendor pins/provenance, house metadata and bundling, target allowlists, and unrelated global/machine setup. It invokes a pinned `plgnz add <bundled-tree>` client. plgnz owns source resolution, host-specific conversion and resource packaging, native plugin installation, refresh, owned cleanup, records, and read-only verification. Standalone skill/command delivery is out of scope; Pi and OpenCode retain reader/remover support only for old plgnz-owned cleanup. Verified work may push directly to `main`; npm release and fleet rollout remain out of scope.

## Interface design gate

Before parallel implementation, the coordinator writes and approves the public JSON outcome/error contract for `add`, `update`, `list`, `remove`, and `doctor`: per-package/per-target status, target validation, collisions, zero discovery, dry-run, partial failure, records, and exit status. A record retains source identity, selection, native identity, pins, and a content fingerprint; a refresh compares materialized content, never only package version or Git SHA. `update` reuses the record and reapplies pins. `doctor` remains reader-only. The existing separate `add-mcp` API stays separate and is not expanded.

## First vertical proof

Terra implements one end-to-end Addy → Codex path from Personal’s bundled tree: nine Markdown commands and 25 skills. plgnz must preserve names, descriptions, invocation restriction, sibling/resource references and arguments; use path-safe reference rewrites only when semantics are proven. It refuses unsupported executable handlers, permission semantics, or preprocessing rather than substituting prose. Isolated tests cover metadata conflicts, unchanged re-add, changed same-version bytes, failure preservation, and unrelated configuration. A native Codex transcript proves ordinary discovery, user-only catalog exclusion, explicit invocation/body/arguments, and resource resolution. Only then does Personal replace the Codex installer and remove its obsolete projection calls. Shared projection helpers still used by excluded standalone routes remain in Personal; delete them only when a source scan proves no active use.

## Broaden by proven profile

The scope freezes at Personal HEAD `610c4e47cfb7750aa1da4221754eaafb76dc974c`: after Codex, the remaining native plugin routes are Claude Code, OMP, dcode, Hermes, OpenClaw, Grok, Kimi, ZCode CLI, ZCode Desktop, Cursor, and a Gemini CLI native extension only if its loader is verified. Each has one Terra owner and one evidence-backed result: supported implementation with lifecycle and loader proof, or explicit unsupported/unverified outcome. CLI, desktop, and plugin surfaces remain distinct. OpenCode, Pi, Factory, and Grok Bot standalone delivery are excluded from this migration; Pi/OpenCode stay available solely to read or remove older plgnz-owned installs. Gemini's native extension remains unverified and is not reclassified as standalone. Personal’s strict/gated host projections are removed after plgnz owns the equivalent conversion. Unknown is visible and blocks that route’s legacy deletion.

## Ownership, sequencing, completion

Coordinator owns interface, acceptance, matrix, and serialized integration; Terra owns bounded implementation; Sol reviews frozen diffs. Shared CLI/state/registry work is serialized; every harness worker changes one harness only. Personal’s shared `plugins.ts`/`deploy.ts` edits are serialized by target. Stage and validate before activation; replace/remove recorded artifacts only; preserve user configuration. Each native route proves install → unchanged re-add → same-version content refresh → failed update preservation → owned remove. Final completion requires the scoped native inventory and deletion of every replaced required native distribution route; an unverified required native route remains incomplete, never a successful consolidation.

## Decisions already fixed

- Public source is a host-neutral bundled tree; Personal owns selection allowlists, preserves `personal` marketplace identity, and retains canonical amended vendor bytes/provenance. A local bundle never causes plgnz to fetch pristine upstream.
- No Addy/Personal special case in plgnz; its conversion is generic and the Personal adapter is deleted after parity.
- Evidence determines each unverified route’s classification and next probe; no new research scope is introduced.
