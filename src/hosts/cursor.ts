/**
 * cursor host reader.
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
 * `pin` rewrites them to absolute paths.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { cursorRoot } from '../paths';
import { collectPluginServers, collectUserServers, readJson } from '../mcp';

function localDir(): string {
  return join(cursorRoot(), 'plugins', 'local');
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

import type { HostWriter, AddOptions } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { which, resolveCommandPath } from '../exec';

export const cursorWriter: HostWriter = {
  ...cursor,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void> {
    const id = plugin.name;
    const targetDir = join(localDir(), id);

    if (opts?.dryRun) {
      console.log(`[cursor] would write directory: ${targetDir}`);
      return;
    }

    if (existsSync(targetDir)) {
      (fs as any).rmSync(targetDir, { recursive: true, force: true });
    }
    mkdirSync(targetDir, { recursive: true });
    cpSync(plugin.dir, targetDir, { recursive: true });

    const pluginJson = join(targetDir, '.plugin', 'plugin.json');
    const rootPluginJson = join(targetDir, 'plugin.json');
    const sourceManifest = existsSync(pluginJson) ? pluginJson : existsSync(rootPluginJson) ? rootPluginJson : null;
    
    const cursorPluginDir = join(targetDir, '.cursor-plugin');
    const cursorPluginJson = join(cursorPluginDir, 'plugin.json');
    
    if (sourceManifest && !existsSync(cursorPluginJson)) {
      mkdirSync(cursorPluginDir, { recursive: true });
      cpSync(sourceManifest, cursorPluginJson);
    }

    const pinMcp = (file: string) => {
      const p = join(targetDir, file);
      if (!existsSync(p)) return;
      try {
        const data = JSON.parse(readFileSync(p, 'utf8'));
        if (data && data.mcpServers) {
          let changed = false;
          for (const key in data.mcpServers) {
            const srv = data.mcpServers[key];
            if (srv && srv.type === 'stdio' && typeof srv.command === 'string') {
              const cmd = srv.command;
              let abs = cmd;
              if (cmd.includes('/')) {
                abs = resolveCommandPath(cmd, targetDir);
              } else {
                const w = which(cmd);
                if (w) abs = w;
              }
              if (abs !== cmd) {
                srv.command = abs;
                changed = true;
              }
            }
          }
          if (changed) writeFileSync(p, JSON.stringify(data, null, 2));
        }
      } catch {}
    };

    pinMcp('mcp.json');
    pinMcp('.mcp.json');
  },
  async remove(id: string): Promise<void> {
    const targetDir = join(localDir(), id);
    if (existsSync(targetDir)) {
      (fs as any).rmSync(targetDir, { recursive: true, force: true });
    }
  }
};
