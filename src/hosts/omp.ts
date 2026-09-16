/**
 * omp host reader.
 *
 * Reader only — the writer (add/pin/remove) lives in
 * src/hosts/omp-writer.ts so loading a reader never evaluates writer code
 * (AGENTS.md: doctor is read-only by construction).
 *
 * Real store layout (measured 2026-09-16, evidence in docs/hosts/omp.md):
 *   ~/.omp/plugins/installed_plugins.json — claude-code-shaped registry:
 *                                           {version:2, plugins:{"<name>@<marketplace>":
 *                                           [{scope, installPath, version, …}]}
 *   ~/.omp/plugins/cache/plugins/<marketplace>___<name>___<version>/ — install dirs
 *                                           (flat triple-underscore keys, unlike
 *                                           claude-code's nested cache layout)
 *   ~/.omp/plugins/omp-plugins.lock.json  — {plugins:{<name>:{version, enabled, …}}}
 *   ~/.omp/plugins/node_modules/<name>    — symlinks into the cache
 *   ~/.omp/marketplaces.json              — {marketplaces:[{name, sourceType, sourceUri, catalogPath}]}
 *
 * omp is a native plugin host with its own store (AGENTS.md hosts list; ground
 * truth "Correction", 2026-09-16) — never routed through a repo-root
 * `.mcp.json`, which is the Claude Code project convention, not omp's plugin
 * surface. omp has no measured user-level MCP config (no ~/.omp/mcp.json on
 * this machine), so doctor's MCP surface is the installed plugins'
 * mcp.json/.mcp.json alone; the shadow check therefore has no user side to
 * trip on until such a config is verified to exist.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { ompRoot } from '../paths';
import { collectPluginServers, readJson, type PluginMcpCandidate } from '../mcp';

export function pluginsDir(): string {
  return join(ompRoot(), 'plugins');
}

/** Where a plugin copy declares MCP servers (spec `mcp.json`, plus the `.mcp.json` twin). */
export function mcpCandidates(): PluginMcpCandidate[] {
  return [
    { kind: 'spec', file: '.mcp.json' },
    { kind: 'spec', file: 'mcp.json' },
  ];
}

/** enabled state from omp-plugins.lock.json, keyed by bare plugin name. */
function lockEnabled(name: string): boolean | undefined {
  const root = readJson(join(pluginsDir(), 'omp-plugins.lock.json'));
  if (root === null) return undefined;
  const plugins = root['plugins'];
  if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) return undefined;
  const entry = (plugins as Record<string, unknown>)[name];
  if (typeof entry !== 'object' || entry === null) return undefined;
  return (entry as Record<string, unknown>)['enabled'] === false ? false : undefined;
}

export const omp: HostReader = {
  id: 'omp',
  gui: false,

  /** omp is present iff its native store is — a stray repo .mcp.json must not conjure the host. */
  detect(): boolean {
    return existsSync(pluginsDir());
  },

  stores(): string[] {
    return [pluginsDir()];
  },

  listInstalled(): InstalledPlugin[] {
    const root = readJson(join(pluginsDir(), 'installed_plugins.json'));
    if (root === null) return [];
    const plugins = root['plugins'];
    if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) return [];
    const out: InstalledPlugin[] = [];
    for (const [id, value] of Object.entries(plugins as Record<string, unknown>)) {
      const at = id.indexOf('@');
      const name = at === -1 ? id : id.slice(0, at);
      const marketplace = at === -1 ? undefined : id.slice(at + 1);
      if (!Array.isArray(value)) continue;
      for (const raw of value) {
        if (typeof raw !== 'object' || raw === null) continue;
        const rec = raw as Record<string, unknown>;
        const version = typeof rec['version'] === 'string' ? rec['version'] : undefined;
        const recordedPath = typeof rec['installPath'] === 'string' ? rec['installPath'] : undefined;
        // Cache slots are flat: cache/plugins/<marketplace>___<name>___<version>.
        const fallback =
          marketplace !== undefined && version !== undefined
            ? join(pluginsDir(), 'cache', 'plugins', `${marketplace}___${name}___${version}`)
            : undefined;
        const path = recordedPath !== undefined && existsSync(recordedPath) ? recordedPath : fallback;
        const plugin: InstalledPlugin = { id, name };
        if (marketplace !== undefined) plugin.marketplace = marketplace;
        if (path !== undefined) plugin.path = path;
        if (version !== undefined) plugin.version = version;
        const enabled = lockEnabled(name);
        if (enabled === false) plugin.enabled = false;
        out.push(plugin);
      }
    }
    return out;
  },

  mcpEntries(): McpServerEntry[] {
    const entries: McpServerEntry[] = [];
    for (const plugin of this.listInstalled()) {
      if (plugin.path === undefined || !existsSync(plugin.path)) continue;
      entries.push(...collectPluginServers(plugin.id, plugin.path, mcpCandidates()));
    }
    return entries;
  },
};
