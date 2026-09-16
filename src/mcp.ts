/**
 * Shared reader for MCP server declarations.
 *
 * Two shapes occur on disk:
 *  - the spec's `mcp.json` / the plugins CLI's `.mcp.json` at the plugin root:
 *    `{ $schema, mcpServers: { <name>: { type, command, args, … } } }`
 *    (spec §7.2.1: `mcpServers` member values are server configs; stdio
 *    servers carry a single-token `command`)
 *  - host-native manifests with an `mcpServers` member, measured in two
 *    variants: kimi `.kimi-plugin/plugin.json` carries the servers inline
 *    (spec-style entries); codex `.codex-plugin/plugin.json` carries a
 *    pointer string — `"mcpServers": "./.mcp.json"` — resolved against the
 *    plugin root (13 manifests measured: 6 pointers, 7 absent, 0 inline)
 *
 * Measured on this machine, `npx plugins add` dereferences one source into
 * *all* of these per install dir, so the same server usually appears 2–3×;
 * identical restatements are deduped, keeping the highest-priority occurrence.
 *
 * The write side is `pinPluginMcpFiles` — the per-host `pin` implementations
 * share it so the file list they rewrite is the same list they read.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerEntry, PinChange, PinOptions, PinOutcome, PinRefusal } from './host';
import { which } from './exec';

export type RawServerDef = Record<string, unknown>;

/**
 * One place a plugin may declare MCP servers, in the host's own priority
 * order: a spec `mcp.json`/`.mcp.json` at the plugin root, or a host-native
 * manifest whose `mcpServers` member is either inline servers or (codex-style)
 * a pointer string at a spec file.
 */
export type PluginMcpCandidate = { kind: 'spec'; file: string } | { kind: 'inline'; manifest: string };

/** The file a candidate names, relative to the plugin root. */
function candidateFile(pluginDir: string, candidate: PluginMcpCandidate): string {
  return candidate.kind === 'spec' ? join(pluginDir, candidate.file) : join(pluginDir, candidate.manifest);
}

export function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `mcpServers` object from a spec `mcp.json`/`.mcp.json` file, or null. */
export function specMcpServers(file: string): Record<string, RawServerDef> | null {
  const root = readJson(file);
  if (root === null) return null;
  const servers = root['mcpServers'];
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return null;
  return servers as Record<string, RawServerDef>;
}

/** Inline `mcpServers` object from a host-native plugin manifest, or null. */
export function inlineMcpServers(manifestFile: string): Record<string, RawServerDef> | null {
  const root = readJson(manifestFile);
  if (root === null) return null;
  const servers = root['mcpServers'];
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return null;
  return servers as Record<string, RawServerDef>;
}

/**
 * The file a host-native manifest's `mcpServers` points at, when it is a
 * codex-style pointer string (`"./.mcp.json"`, resolved against the plugin
 * root), or null when it is not a pointer / points nowhere.
 */
export function pointerMcpFile(manifestFile: string, pluginDir: string): string | null {
  const root = readJson(manifestFile);
  if (root === null) return null;
  const pointer = root['mcpServers'];
  if (typeof pointer !== 'string') return null;
  const pointed = join(pluginDir, pointer);
  return existsSync(pointed) ? pointed : null;
}

export function normalizeTransport(def: RawServerDef): 'stdio' | 'http' | null {
  const type = typeof def['type'] === 'string' ? def['type'] : undefined;
  if (type === 'http' || type === 'sse' || typeof def['url'] === 'string') return 'http';
  if (type === 'stdio' || typeof def['command'] === 'string') return 'stdio';
  return null;
}

/**
 * Collect deduped MCP entries for one plugin directory.
 * `candidates` is in priority order — the file the host actually launches
 * from comes first (see docs/hosts/<host>.md for per-host evidence).
 */
export function collectPluginServers(
  pluginId: string,
  pluginDir: string,
  candidates: readonly PluginMcpCandidate[],
): McpServerEntry[] {
  const entries: McpServerEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    // A native manifest resolves to itself (inline servers) or, codex-style,
    // to the spec file its `mcpServers` pointer names.
    let file: string;
    let servers: Record<string, RawServerDef> | null;
    if (candidate.kind === 'spec') {
      file = join(pluginDir, candidate.file);
      servers = specMcpServers(file);
    } else {
      file = join(pluginDir, candidate.manifest);
      const pointed = pointerMcpFile(file, pluginDir);
      if (pointed !== null) {
        file = pointed;
        servers = specMcpServers(pointed);
      } else {
        servers = inlineMcpServers(file);
      }
    }
    if (servers === null) continue;
    for (const [name, def] of Object.entries(servers)) {
      const transport = normalizeTransport(def);
      if (transport === null) continue;
      const command = typeof def['command'] === 'string' ? def['command'] : undefined;
      const rawArgs = def['args'];
      const args = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === 'string') : undefined;
      // Dedupe identical restatements across the candidate files.
      const key = `${name}\0${transport}\0${command ?? ''}\0${JSON.stringify(args ?? [])}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: McpServerEntry = {
        name,
        transport,
        origin: 'plugin',
        pluginId,
        file,
        baseDir: pluginDir,
      };
      if (command !== undefined) entry.command = command;
      if (args !== undefined) entry.args = args;
      if (def['enabled'] === false) entry.enabled = false;
      entries.push(entry);
    }
  }
  return entries;
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

/** Collect entries from a host-level config file (`mcpServers` object shape). */
export function collectUserServers(file: string, baseDir: string): McpServerEntry[] {
  const servers = specMcpServers(file);
  if (servers === null) return [];
  const entries: McpServerEntry[] = [];
  for (const [name, def] of Object.entries(servers)) {
    const transport = normalizeTransport(def);
    if (transport === null) continue;
    const command = typeof def['command'] === 'string' ? def['command'] : undefined;
    const rawArgs = def['args'];
    const args = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === 'string') : undefined;
    const entry: McpServerEntry = { name, transport, origin: 'user', file, baseDir };
    if (command !== undefined) entry.command = command;
    if (args !== undefined) entry.args = args;
    if (def['enabled'] === false) entry.enabled = false;
    entries.push(entry);
  }
  return entries;
}
