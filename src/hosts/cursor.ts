/**
 * cursor host reader.
 *
 * Reader only — the writer (add/pin/remove) lives in
 * src/hosts/cursor-writer.ts so loading a reader never evaluates writer code
 * (AGENTS.md: doctor is read-only by construction).
 *
 * Real store layout (measured 2026-09-16, evidence in docs/hosts/cursor.md):
 *   ~/.cursor/mcp.json                      — user-level {mcpServers:{…}}
 *   ~/.cursor/plugins/local/<name>/         — dereferenced plugin copies (the route
 *                                              `npx plugins --target cursor` does NOT take;
 *                                              house evidence: install rejected)
 *   ~/.cursor/plugins/{cache,marketplaces}/ — cursor-native dirs, observed but not read in v0
 *
 * Plugin MCP is declared in `.mcp.json` (and a spec `mcp.json` copy) at the
 * plugin root. Cursor is a GUI host: `launchctl getenv PATH` is unset, so bare
 * commands cannot be assumed to resolve (spec §7.2.1) — doctor flags them and
 * `pin` rewrites them to absolute paths; `add` pins a fresh copy the same way.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { cursorRoot } from '../paths';
import { collectPluginServers, collectUserServers, readJson, type PluginMcpCandidate } from '../mcp';

export function localDir(): string {
  return join(cursorRoot(), 'plugins', 'local');
}

/** Where a plugin copy may declare MCP servers, in cursor's priority order. */
export function mcpCandidates(): PluginMcpCandidate[] {
  return [
    { kind: 'spec', file: '.mcp.json' },
    { kind: 'spec', file: 'mcp.json' },
  ];
}

function userConfigFile(): string {
  return join(cursorRoot(), 'mcp.json');
}

export const cursor: HostReader = {
  id: 'cursor',
  gui: true,

  detect(): boolean {
    return existsSync(cursorRoot());
  },

  stores(): string[] {
    return [localDir()];
  },

  listInstalled(): InstalledPlugin[] {
    if (!existsSync(localDir())) return [];
    const out: InstalledPlugin[] = [];
    for (const entry of readdirSync(localDir())) {
      const dir = join(localDir(), entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifest = join(dir, '.cursor-plugin', 'plugin.json');
      if (!existsSync(manifest)) continue;
      const plugin: InstalledPlugin = { id: entry, name: entry, path: dir };
      const parsed = readJson(manifest);
      const version = parsed !== null ? parsed['version'] : undefined;
      if (typeof version === 'string') plugin.version = version;
      out.push(plugin);
    }
    return out;
  },

  mcpEntries(): McpServerEntry[] {
    const entries: McpServerEntry[] = [];
    entries.push(...collectUserServers(userConfigFile(), cursorRoot()));
    for (const plugin of this.listInstalled()) {
      if (plugin.path === undefined || !existsSync(plugin.path)) continue;
      entries.push(...collectPluginServers(plugin.id, plugin.path, mcpCandidates()));
    }
    return entries;
  },
};
