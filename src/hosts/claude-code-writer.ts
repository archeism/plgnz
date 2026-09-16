/**
 * claude-code host writer — add/pin/remove for the store documented in
 * docs/hosts/claude-code.md.
 *
 * A sibling of the reader module, not a section of it: a module is evaluated
 * whole, so a writer exported from src/hosts/claude-code.ts would load with
 * the reader and reach doctor through the registry. doctor is read-only by
 * construction (AGENTS.md) — test/doctor-imports.test.ts pins that this
 * module stays out of its import graph.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { claudeCode, mcpCandidates, pluginsDir } from './claude-code';
import { pinPluginMcpFiles } from '../mcp-write';

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
