/**
 * claude-code host reader.
 *
 * Real store layout (measured 2026-09-16, evidence in docs/hosts/claude-code.md):
 *   ~/.claude/plugins/installed_plugins.json   — {version:2, plugins:{"<name>@<marketplace>":
 *                                                   [{scope, installPath, version, gitCommitSha, …}]}
 *   ~/.claude/plugins/cache/<marketplace>/<name>/<version-or-sha>/  — install dirs
 *   ~/.claude.json                             — user-level top-level `mcpServers`
 *
 * Plugin MCP is declared in `.mcp.json` at the plugin root (the plugins CLI
 * also writes a spec `mcp.json`; both are read, identical entries deduped —
 * spec §7.2.1 fixes the spec path as `mcp.json`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { claudeCodeRoot, homeRoot } from '../paths';
import { collectPluginServers, collectUserServers, readJson } from '../mcp';

interface InstallRecordShape {
  scope?: string;
  installPath?: string;
  version?: string;
  gitCommitSha?: string;
}

function pluginsDir(): string {
  return join(claudeCodeRoot(), 'plugins');
}

function userConfigFile(): string {
  // The user-level config is `~/.claude.json` — a sibling of `~/.claude`, so
  // it follows OPEN_PLUGIN_HOME, not the per-host root override.
  return join(homeRoot(), '.claude.json');
}

export const claudeCode: HostReader = {
  id: 'claude-code',
  gui: false,

  detect(): boolean {
    return existsSync(claudeCodeRoot());
  },

  stores(): string[] {
    return [pluginsDir()];
  },

  listInstalled(): InstalledPlugin[] {
    const file = join(pluginsDir(), 'installed_plugins.json');
    const root = readJson(file);
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
        const rec = raw as InstallRecordShape;
        const version = typeof rec.version === 'string' ? rec.version : undefined;
        const recordedPath = typeof rec.installPath === 'string' ? rec.installPath : undefined;
        // Real records store absolute installPaths; fall back to the computed
        // cache slot so relocated/fixture stores still resolve.
        const fallback =
          marketplace !== undefined && version !== undefined
            ? join(pluginsDir(), 'cache', marketplace, name, version)
            : undefined;
        const path = recordedPath !== undefined && existsSync(recordedPath) ? recordedPath : fallback;
        const sha = typeof rec.gitCommitSha === 'string' ? rec.gitCommitSha : undefined;
        const plugin: InstalledPlugin = { id, name };
        if (marketplace !== undefined) plugin.marketplace = marketplace;
        if (path !== undefined) plugin.path = path;
        if (version !== undefined) plugin.version = version;
        if (sha !== undefined) plugin.sha = sha;
        out.push(plugin);
      }
    }
    return out;
  },

  mcpEntries(): McpServerEntry[] {
    const entries: McpServerEntry[] = [];
    entries.push(...collectUserServers(userConfigFile(), claudeCodeRoot()));
    for (const plugin of this.listInstalled()) {
      if (plugin.path === undefined || !existsSync(plugin.path)) continue;
      entries.push(
        ...collectPluginServers(plugin.id, plugin.path, [
          { kind: 'spec', file: '.mcp.json' },
          { kind: 'spec', file: 'mcp.json' },
        ]),
      );
    }
    return entries;
  },
};
