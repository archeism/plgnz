/**
 * codex host writer — add/pin/remove for the store documented in
 * docs/hosts/codex.md.
 *
 * A sibling of the reader module so doctor's import graph never loads writer
 * code (AGENTS.md: doctor is read-only by construction;
 * test/doctor-imports.test.ts pins it).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { codexHome } from '../paths';
import { codex, configFile, mcpCandidates } from './codex';
import { pinPluginMcpFiles } from '../mcp-write';

export const codexWriter: HostWriter = {
  ...codex,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void> {
    const marketplace = plugin.marketplace || 'local';
    const id = `${plugin.name}@${marketplace}`;
    const targetDir = join(codexHome(), 'plugins', 'cache', marketplace, plugin.name, resolved.sha);
    const configPath = configFile();

    if (opts?.dryRun) {
      console.log(`[codex] would write directory: ${targetDir}`);
      console.log(`[codex] would update config: ${configPath}`);
      return;
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      cpSync(plugin.dir, targetDir, { recursive: true });
    }

    const pluginJson = join(targetDir, '.plugin', 'plugin.json');
    const rootPluginJson = join(targetDir, 'plugin.json');
    const sourceManifest = existsSync(pluginJson) ? pluginJson : existsSync(rootPluginJson) ? rootPluginJson : null;

    const targetPluginDir = join(targetDir, '.codex-plugin');
    const targetPluginJson = join(targetPluginDir, 'plugin.json');

    if (sourceManifest && !existsSync(targetPluginJson)) {
      mkdirSync(targetPluginDir, { recursive: true });
      cpSync(sourceManifest, targetPluginJson);
    }


    let toml = '';
    if (existsSync(configPath)) {
      toml = readFileSync(configPath, 'utf8');
    }

    let newToml = toml;
    const header = `[plugins."${id}"]`;
    const idx = toml.indexOf(header);
    if (idx !== -1) {
      const nextTable = toml.indexOf('\n[', idx + header.length);
      const blockEnd = nextTable !== -1 ? nextTable : toml.length;
      const block = toml.slice(idx, blockEnd);
      if (block.includes('enabled = false')) {
        const newBlock = block.replace('enabled = false', 'enabled = true');
        newToml = toml.slice(0, idx) + newBlock + toml.slice(blockEnd);
      } else if (!block.includes('enabled = true')) {
        newToml = toml.slice(0, idx + header.length) + '\nenabled = true' + toml.slice(idx + header.length);
      }
    } else {
      if (!newToml.endsWith('\n') && newToml.length > 0) newToml += '\n';
      newToml += `[plugins."${id}"]\nenabled = true\n`;
    }

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, newToml);
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const configPath = configFile();
    if (!existsSync(configPath)) return;
    const toml = readFileSync(configPath, 'utf8');

    const header = `[plugins."${id}"]`;
    const idx = toml.indexOf(header);
    if (idx !== -1) {
      const nextTable = toml.indexOf('\n[', idx + header.length);
      const blockEnd = nextTable !== -1 ? nextTable : toml.length;
      const newToml = toml.slice(0, idx) + toml.slice(blockEnd);
      writeFileSync(configPath, newToml);
    }
  }
};
