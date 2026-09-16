/**
 * cursor host writer — add/pin/remove for the store documented in
 * docs/hosts/cursor.md.
 *
 * A sibling of the reader module so doctor's import graph never loads writer
 * code (AGENTS.md: doctor is read-only by construction;
 * test/doctor-imports.test.ts pins it).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { cursor, localDir, mcpCandidates } from './cursor';
import { pinPluginMcpFiles } from '../mcp-write';

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
      rmSync(targetDir, { recursive: true, force: true });
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

    // Cursor is a GUI host with no shell PATH, so a freshly copied plugin is
    // pinned as it lands (the same repair `pin` performs on an existing copy).
    pinPluginMcpFiles(targetDir, mcpCandidates());
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const targetDir = join(localDir(), id);
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
  }
};
