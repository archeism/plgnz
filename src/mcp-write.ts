/**
 * The write side of the shared MCP reader (src/mcp.ts).
 *
 * `pinPluginMcpFiles` lives here, not in mcp.ts, because every host reader
 * imports mcp.ts's read helpers — and a module is evaluated whole, so the
 * `writeFileSync` would load with them and reach doctor through the registry.
 * Only the host writers (src/hosts/<host>-writer.ts) import this module;
 * test/doctor-imports.test.ts keeps it out of doctor's import graph.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PinChange, PinOptions, PinOutcome, PinRefusal } from './host';
import { normalizeTransport, readJson, type PluginMcpCandidate, type RawServerDef } from './mcp';
import { which } from './exec';

/** The file a candidate names, relative to the plugin root. */
function candidateFile(pluginDir: string, candidate: PluginMcpCandidate): string {
  return candidate.kind === 'spec' ? join(pluginDir, candidate.file) : join(pluginDir, candidate.manifest);
}

/**
 * Rewrite bare stdio `command`s in one plugin copy to the absolute path they
 * resolve to on this process's PATH — the write side of `pin`, shared by every
 * host so the files it rewrites are exactly the `candidates` it reads.
 *
 * Per spec §7.2.1 a `command` is a single executable token, either bare or a
 * plugin-relative path starting with `./`; only the bare form is rewritten
 * here (a `./`-relative or absolute command is already unambiguous). A bare
 * command that does not resolve is never invented: it is returned as a refusal
 * and the file is left as-is.
 *
 * A codex-style pointer manifest (`"mcpServers": "./.mcp.json"`) is not an
 * object, so it is skipped here — the file it points at is a spec candidate of
 * its own and gets pinned directly.
 */
export function pinPluginMcpFiles(
  pluginDir: string,
  candidates: readonly PluginMcpCandidate[],
  opts: PinOptions = {},
): PinOutcome {
  const changes: PinChange[] = [];
  const refusals: PinRefusal[] = [];
  // One server is usually restated across 2–3 files; report each name once
  // (the twins are still rewritten below) so findings and recorded pins don't
  // repeat per file.
  const reported = new Set<string>();
  for (const candidate of candidates) {
    const file = candidateFile(pluginDir, candidate);
    const root = readJson(file);
    if (root === null) continue;
    const servers = root['mcpServers'];
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) continue;
    let rewritten = false;
    for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
      if (opts.only !== undefined && !opts.only.includes(name)) continue;
      if (typeof value !== 'object' || value === null) continue;
      const def = value as RawServerDef;
      if (normalizeTransport(def) !== 'stdio') continue;
      const command = def['command'];
      if (typeof command !== 'string' || command.length === 0 || command.includes('/')) continue;
      const resolved = which(command);
      if (resolved === null) {
        if (!reported.has(name)) {
          reported.add(name);
          refusals.push({ server: name, command, file });
        }
        continue;
      }
      if (!reported.has(name)) {
        reported.add(name);
        changes.push({ server: name, from: command, to: resolved, file });
      }
      if (command !== resolved) {
        def['command'] = resolved;
        rewritten = true;
      }
    }
    if (rewritten && opts.dryRun !== true) writeFileSync(file, JSON.stringify(root, null, 2));
  }
  return { changes, refusals };
}
