/**
 * kimi host writer — add/pin/remove for the store documented in
 * docs/hosts/kimi.md.
 *
 * A sibling of the reader module so doctor's import graph never loads writer
 * code (AGENTS.md: doctor is read-only by construction;
 * test/doctor-imports.test.ts pins it).
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { kimi, mcpCandidates, pluginsDir } from './kimi';
import { pinPluginMcpFiles } from '../mcp-write';

export const kimiWriter: HostWriter = {
  ...kimi,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void> {
    const id = plugin.name;
    const targetDir = join(pluginsDir(), 'managed', id);
    const regFile = join(pluginsDir(), 'installed.json');

    if (opts?.dryRun) {
      console.log(`[kimi] would write directory: ${targetDir}`);
      console.log(`[kimi] would update registry: ${regFile}`);
      return;
    }

    // kimi's install dir is *not* version-addressed (`plugins/managed/<id>`),
    // so re-adding must replace the copy rather than keep the first one —
    // otherwise `update` would re-register a stale tree.
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    cpSync(plugin.dir, targetDir, { recursive: true });

    // add shim if needed
    const pluginJson = join(targetDir, '.plugin', 'plugin.json');
    const rootPluginJson = join(targetDir, 'plugin.json');
    const sourceManifest = existsSync(pluginJson) ? pluginJson : existsSync(rootPluginJson) ? rootPluginJson : null;

    const targetPluginDir = join(targetDir, '.kimi-plugin');
    const targetPluginJson = join(targetPluginDir, 'plugin.json');

    if (sourceManifest && !existsSync(targetPluginJson)) {
      mkdirSync(targetPluginDir, { recursive: true });
      cpSync(sourceManifest, targetPluginJson);
    }

    let reg: any = { version: 1, plugins: [] };
    if (existsSync(regFile)) {
      try {
        reg = JSON.parse(readFileSync(regFile, 'utf8'));
      } catch {}
    }
    if (!Array.isArray(reg.plugins)) reg.plugins = [];
    const now = new Date().toISOString();

    let existing = reg.plugins.find((p: any) => p.id === id);
    if (!existing) {
      existing = { id, enabled: true, installedAt: now, source: 'local-path' };
      reg.plugins.push(existing);
    }

    existing.root = targetDir;
    existing.updatedAt = now;
    existing.originalSource = resolved.sourceUri;

    mkdirSync(dirname(regFile), { recursive: true });
    writeFileSync(regFile, JSON.stringify(reg, null, 2));
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const regFile = join(pluginsDir(), 'installed.json');
    if (!existsSync(regFile)) return;
    let reg: any;
    try {
      reg = JSON.parse(readFileSync(regFile, 'utf8'));
    } catch { return; }
    if (!Array.isArray(reg.plugins)) return;
    reg.plugins = reg.plugins.filter((p: any) => p.id !== id);
    writeFileSync(regFile, JSON.stringify(reg, null, 2));
  }
};
