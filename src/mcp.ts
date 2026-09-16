/**
 * Shared reader for MCP server declarations.
 *
 * Two shapes occur on disk:
 *  - the spec's `mcp.json` / the plugins CLI's `.mcp.json` at the plugin root:
 *    `{ $schema, mcpServers: { <name>: { type, command, args, … } } }`
 *    (spec §7.2.1: `mcpServers` member values are server configs; stdio
 *    servers carry a single-token `command`)
 *  - host-native manifests with inline `mcpServers` (kimi `.kimi-plugin/plugin.json`
 *    uses spec-style entries; codex `.codex-plugin/plugin.json` uses its
 *    config.toml shape: `command`/`args` with no `type`)
 *
 * Measured on this machine, `npx plugins add` dereferences one source into
 * *all* of these per install dir, so the same server usually appears 2–3×;
 * identical restatements are deduped, keeping the highest-priority occurrence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerEntry } from './host';

export type RawServerDef = Record<string, unknown>;

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
  candidates: Array<{ kind: 'spec'; file: string } | { kind: 'inline'; manifest: string }>,
): McpServerEntry[] {
  const entries: McpServerEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const servers =
      candidate.kind === 'spec'
        ? specMcpServers(join(pluginDir, candidate.file))
        : inlineMcpServers(join(pluginDir, candidate.manifest));
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
        file: candidate.kind === 'spec' ? join(pluginDir, candidate.file) : join(pluginDir, candidate.manifest),
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

/** Collect entries from a host-level config file (`mcpServers` object shape). */
export function collectUserServers(
  file: string,
  baseDir: string,
  origin: 'user' | 'config' = 'user',
): McpServerEntry[] {
  const servers = specMcpServers(file);
  if (servers === null) return [];
  const entries: McpServerEntry[] = [];
  for (const [name, def] of Object.entries(servers)) {
    const transport = normalizeTransport(def);
    if (transport === null) continue;
    const command = typeof def['command'] === 'string' ? def['command'] : undefined;
    const rawArgs = def['args'];
    const args = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === 'string') : undefined;
    const entry: McpServerEntry = { name, transport, origin, file, baseDir };
    if (command !== undefined) entry.command = command;
    if (args !== undefined) entry.args = args;
    if (def['enabled'] === false) entry.enabled = false;
    entries.push(entry);
  }
  return entries;
}
