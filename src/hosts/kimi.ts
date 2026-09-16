/**
 * kimi host reader.
 *
 * Reader only — the writer (add/pin/remove) lives in
 * src/hosts/kimi-writer.ts so loading a reader never evaluates writer code
 * (AGENTS.md: doctor is read-only by construction).
 *
 * Real store layout (measured 2026-09-16, evidence in docs/hosts/kimi.md):
 *   ~/.kimi-code/plugins/installed.json — {version:1, plugins:[{id, root, source,
 *                                           enabled, installedAt, updatedAt, originalSource}]}
 *   ~/.kimi-code/plugins/managed/<id>/  — install dirs (`.kimi-plugin/plugin.json`
 *                                           native manifest with inline `mcpServers`,
 *                                           plus spec `.plugin/plugin.json` and
 *                                           `.mcp.json`/`mcp.json` copies)
 *
 * User-level MCP would be `[mcp_servers.<name>]` in ~/.kimi-code/config.toml
 * (kimi is a TOML-config host like codex). None exist on this machine as of
 * 2026-09-16, so that half of the reader is defensive and its shadow
 * semantics are unverified — see docs/hosts/kimi.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { kimiRoot } from '../paths';
import { collectPluginServers, readJson, type PluginMcpCandidate, type RawServerDef } from '../mcp';

export function pluginsDir(): string {
  return join(kimiRoot(), 'plugins');
}

/**
 * Where a plugin declares MCP servers. The native manifest carries them inline
 * (measured), ahead of the spec copies `npx plugins` also dereferences.
 */
export function mcpCandidates(): PluginMcpCandidate[] {
  return [
    { kind: 'inline', manifest: join('.kimi-plugin', 'plugin.json') },
    { kind: 'spec', file: '.mcp.json' },
    { kind: 'spec', file: 'mcp.json' },
  ];
}

function configFile(): string {
  return join(kimiRoot(), 'config.toml');
}

export const kimi: HostReader = {
  id: 'kimi',
  gui: false,

  detect(): boolean {
    return existsSync(kimiRoot());
  },

  stores(): string[] {
    return [join(pluginsDir(), 'managed')];
  },

  listInstalled(): InstalledPlugin[] {
    const root = readJson(join(pluginsDir(), 'installed.json'));
    if (root === null) return [];
    const plugins = root['plugins'];
    if (!Array.isArray(plugins)) return [];
    const out: InstalledPlugin[] = [];
    for (const raw of plugins) {
      if (typeof raw !== 'object' || raw === null) continue;
      const rec = raw as Record<string, unknown>;
      const id = typeof rec['id'] === 'string' ? rec['id'] : null;
      if (id === null) continue;
      const plugin: InstalledPlugin = { id, name: id };
      const path = typeof rec['root'] === 'string' ? rec['root'] : undefined;
      if (path !== undefined && existsSync(path)) plugin.path = path;
      if (rec['enabled'] === false) plugin.enabled = false;
      out.push(plugin);
    }
    return out;
  },

  mcpEntries(): McpServerEntry[] {
    const entries: McpServerEntry[] = [];
    if (existsSync(configFile())) {
      try {
        const parsed: unknown = parseToml(readFileSync(configFile(), 'utf8'));
        const config = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
        const servers =
          config !== null && typeof config['mcp_servers'] === 'object' && config['mcp_servers'] !== null
            ? (config['mcp_servers'] as Record<string, unknown>)
            : null;
        if (servers !== null) {
          for (const [name, value] of Object.entries(servers)) {
            if (typeof value !== 'object' || value === null) continue;
            const def = value as RawServerDef;
            const transport =
              typeof def['url'] === 'string' ? 'http' : typeof def['command'] === 'string' ? 'stdio' : null;
            if (transport === null) continue;
            const entry: McpServerEntry = { name, transport, origin: 'user', file: configFile(), baseDir: kimiRoot() };
            const command = def['command'];
            if (typeof command === 'string') entry.command = command;
            const rawArgs = def['args'];
            if (Array.isArray(rawArgs)) entry.args = rawArgs.filter((a): a is string => typeof a === 'string');
            if (def['enabled'] === false) entry.enabled = false;
            entries.push(entry);
          }
        }
      } catch {
        // malformed config.toml — treated as no user-level MCP entries
      }
    }
    for (const plugin of this.listInstalled()) {
      if (plugin.path === undefined || !existsSync(plugin.path)) continue;
      entries.push(...collectPluginServers(plugin.id, plugin.path, mcpCandidates()));
    }
    return entries;
  },
};
