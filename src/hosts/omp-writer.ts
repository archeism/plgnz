/**
 * omp host writer — add/pin/remove for the store documented in
 * docs/hosts/omp.md.
 *
 * A sibling of the reader module so doctor's import graph never loads writer
 * code (AGENTS.md: doctor is read-only by construction;
 * test/doctor-imports.test.ts pins it).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { omp, mcpCandidates, pluginsDir } from './omp';
import { pinPluginMcpFiles } from '../mcp-write';

export const ompWriter: HostWriter = {
  ...omp,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void> {
    const marketplace = plugin.marketplace || 'local';
    const id = `${plugin.name}@${marketplace}`;
    const targetDir = join(pluginsDir(), 'cache', 'plugins', `${marketplace}___${plugin.name}___${resolved.sha}`);
    const regFile = join(pluginsDir(), 'installed_plugins.json');
    const lockFile = join(pluginsDir(), 'omp-plugins.lock.json');

    if (opts?.dryRun) {
      console.log(`[omp] would write directory: ${targetDir}`);
      console.log(`[omp] would update registry: ${regFile}`);
      console.log(`[omp] would update lockfile: ${lockFile}`);
      return;
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      cpSync(plugin.dir, targetDir, { recursive: true });
    }

    // registry
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

    reg.plugins[id] = [entry];
    mkdirSync(dirname(regFile), { recursive: true });
    writeFileSync(regFile, JSON.stringify(reg, null, 2));

    // lock
    let lock: any = { plugins: {} };
    if (existsSync(lockFile)) {
      try {
        lock = JSON.parse(readFileSync(lockFile, 'utf8'));
      } catch {}
    }
    if (!lock.plugins) lock.plugins = {};
    if (!lock.plugins[plugin.name]) lock.plugins[plugin.name] = { version: resolved.sha, enabled: true };
    else {
      lock.plugins[plugin.name].version = resolved.sha;
      lock.plugins[plugin.name].enabled = true;
    }
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const regFile = join(pluginsDir(), 'installed_plugins.json');
    if (existsSync(regFile)) {
      let reg: any;
      try {
        reg = JSON.parse(readFileSync(regFile, 'utf8'));
      } catch { return; }
      if (reg.plugins && reg.plugins[id]) {
        delete reg.plugins[id];
        writeFileSync(regFile, JSON.stringify(reg, null, 2));
      }
    }

    const at = id.indexOf('@');
    const name = at === -1 ? id : id.slice(0, at);
    const lockFile = join(pluginsDir(), 'omp-plugins.lock.json');
    if (existsSync(lockFile)) {
      let lock: any;
      try {
        lock = JSON.parse(readFileSync(lockFile, 'utf8'));
      } catch { return; }
      if (lock.plugins && lock.plugins[name]) {
        delete lock.plugins[name];
        writeFileSync(lockFile, JSON.stringify(lock, null, 2));
      }
    }
  }
};
