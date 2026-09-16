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
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry, PinOptions, PinOutcome } from '../host';
import { claudeCodeRoot, homeRoot } from '../paths';
import { collectPluginServers, collectUserServers, pinPluginMcpFiles, readJson, type PluginMcpCandidate } from '../mcp';

/** Where a plugin copy declares MCP servers (spec `mcp.json`, plus the `npx plugins` `.mcp.json` twin). */
function mcpCandidates(): PluginMcpCandidate[] {
  return [
    { kind: 'spec', file: '.mcp.json' },
    { kind: 'spec', file: 'mcp.json' },
  ];
}

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
      entries.push(...collectPluginServers(plugin.id, plugin.path, mcpCandidates()));
    }
    return entries;
  },
};

import type { HostWriter, AddOptions } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

export const claudeCodeWriter: HostWriter = {
  ...claudeCode,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void> {
    const marketplace = plugin.marketplace || 'local';
    const id = `${plugin.name}@${marketplace}`;
    const targetDir = join(pluginsDir(), 'cache', marketplace, plugin.name, resolved.sha);
    const regFile = join(pluginsDir(), 'installed_plugins.json');

    if (opts?.dryRun) {
      console.log(`[claude-code] would write directory: ${targetDir}`);
      console.log(`[claude-code] would update registry: ${regFile}`);
      return;
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      cpSync(plugin.dir, targetDir, { recursive: true });
    }

    const pluginJson = join(targetDir, '.plugin', 'plugin.json');
    const rootPluginJson = join(targetDir, 'plugin.json');
    const sourceManifest = existsSync(pluginJson) ? pluginJson : existsSync(rootPluginJson) ? rootPluginJson : null;
    
    const targetPluginDir = join(targetDir, '.claude-plugin');
    const targetPluginJson = join(targetPluginDir, 'plugin.json');
    
    if (sourceManifest && !existsSync(targetPluginJson)) {
      mkdirSync(targetPluginDir, { recursive: true });
      cpSync(sourceManifest, targetPluginJson);
    }


    let reg: any = { version: 2, plugins: {} };
    if (existsSync(regFile)) {
      try {
        reg = JSON.parse(readFileSync(regFile, 'utf8'));
      } catch {}
    }
    if (!reg.plugins) reg.plugins = {};
    const now = new Date().toISOString();
    
    let existing = null;
    if (Array.isArray(reg.plugins[id])) {
      existing = reg.plugins[id].find((r: any) => r.scope === 'user');
    }
    
    const entry = existing || { scope: 'user', installedAt: now };
    entry.installPath = targetDir;
    entry.version = resolved.sha;
    entry.lastUpdated = now;
    if (resolved.isGit) entry.gitCommitSha = resolved.sha;
    
    reg.plugins[id] = [entry];
    mkdirSync(dirname(regFile), { recursive: true });
    writeFileSync(regFile, JSON.stringify(reg, null, 2));
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const regFile = join(pluginsDir(), 'installed_plugins.json');
    if (!existsSync(regFile)) return;
    let reg: any;
    try {
      reg = JSON.parse(readFileSync(regFile, 'utf8'));
    } catch { return; }
    if (!reg.plugins || !reg.plugins[id]) return;
    delete reg.plugins[id];
    writeFileSync(regFile, JSON.stringify(reg, null, 2));
  }
};
