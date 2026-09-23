/**
 * Hermes portable Agent Plugin reader.
 *
 * Evidence: Hermes Agent `c0d7294769`, `hermes_cli/plugins_cmd.py` accepts a
 * root `plugin.json` under `$HERMES_HOME/plugins`; portable packages are active
 * only when their native name is in `plugins.enabled` and absent from
 * `plugins.disabled`.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { hermesRoot } from '../paths';
import { collectPluginServers } from '../mcp';
import { hermesCommandCompanionId } from '../hermes-identity';

declare const Bun: { YAML: { parse(input: string): unknown } };

export function hermesPluginsDir(): string { return join(hermesRoot(), 'plugins'); }

type Manifest = { name: string; version?: string };

function ownedId(dir: string, fallback: string): string {
  const file = join(dir, '.plgnz-install.json');
  if (!existsSync(file)) return fallback;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const id = (value as Record<string, unknown>).pluginId;
    return typeof id === 'string' && (id === fallback || id.startsWith(`${fallback}@`)) ? id : fallback;
  } catch { return fallback; }
}

function readManifest(dir: string): Manifest | undefined {
  const file = join(dir, 'plugin.json');
  if (!existsSync(file) || !statSync(file).isFile()) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.name !== 'string' || !validId(record.name)) return undefined;
    if (record.version !== undefined && typeof record.version !== 'string') return undefined;
    return { name: record.name, ...(typeof record.version === 'string' ? { version: record.version } : {}) };
  } catch { return undefined; }
}

function names(key: 'enabled' | 'disabled'): Set<string> {
  const config = join(hermesRoot(), 'config.yaml');
  if (!existsSync(config)) return new Set();
  try {
    const parsed: unknown = Bun.YAML.parse(readFileSync(config, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set();
    const plugins = (parsed as Record<string, unknown>)['plugins'];
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return new Set();
    const values = (plugins as Record<string, unknown>)[key];
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && validId(value)) : []);
  } catch { return new Set(); }
}

function validId(value: string): boolean { return /^[a-z0-9][a-z0-9._-]*$/iu.test(value); }

export const hermes: HostReader = {
  id: 'hermes', gui: false,
  detect: () => existsSync(join(hermesRoot(), 'config.yaml')) || existsSync(hermesPluginsDir()),
  stores: () => [hermesRoot(), hermesPluginsDir()],
  listInstalled(): InstalledPlugin[] {
    const root = hermesPluginsDir();
    if (!existsSync(root)) return [];
    const enabled = names('enabled'); const disabled = names('disabled'); const result: InstalledPlugin[] = [];
    for (const entry of readdirSync(root).sort()) {
      if (entry.startsWith('.')) continue;
      const dir = join(root, entry);
      if (lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) continue;
      const manifest = readManifest(dir);
      if (manifest === undefined) continue;
      const id = ownedId(dir, manifest.name); const at = id.indexOf('@');
      const companion = join(root, hermesCommandCompanionId(manifest.name));
      const hasCompanion = existsSync(join(companion, 'plugin.yaml'));
      const companionId = hermesCommandCompanionId(manifest.name);
      const contentRoots: Record<string, string> = hasCompanion ? { package: dir, commands: companion } : { package: dir };
      const active = enabled.has(manifest.name) && !disabled.has(manifest.name) && (!hasCompanion || (enabled.has(companionId) && !disabled.has(companionId)));
      result.push({ id, name: manifest.name, ...(at < 0 ? {} : { marketplace: id.slice(at + 1) }), path: dir, contentRoots, ...(manifest.version ? { version: manifest.version } : {}), enabled: active });
    }
    return result;
  },
  mcpEntries(): McpServerEntry[] {
    return this.listInstalled().flatMap(plugin => plugin.path === undefined ? [] : collectPluginServers(plugin.id, plugin.path, [{ kind: 'spec', file: 'mcp.json' }]));
  },
};
