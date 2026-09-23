/**
 * Official ZCode CLI reader.
 *
 * `doctor` must be read-only, so this module reads ZCode's installed registry
 * directly. It never invokes `plugins list`: that command initializes bundled
 * plugins in an otherwise empty store (evidence 2026-09-23).
 */
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { homeRoot, zcodeCliConfigRoot, zcodeCliRoot, zcodeStorageRoot } from '../paths';

declare const Bun: any;
declare const TextDecoder: any;

type NativeRecord = { id: string; name: string; marketplace: string; version: string; installPath: string; scope: 'user' | 'workspace' };
type Ownership = { owner: 'plgnz'; schema: 1; logicalId: string; nativeId: string; fingerprint: string; source: string; resourcePath?: string };

export function zcodeRegistryFile(): string { return join(zcodeCliRoot(), 'plugins', 'installed_plugins.json'); }
export function zcodeMarketplaceRoot(): string { return join(zcodeCliRoot(), 'plgnz-marketplaces'); }
export function zcodeResourceRoot(): string { return join(zcodeCliRoot(), 'plgnz-resources'); }
export function zcodeCliBinary(): string | undefined { return process.env['OPEN_PLUGIN_ZCODE_CLI_BIN']; }

/** Official CLI gets its storage parent through this supported test override. */
export function zcodeCliEnv(): Record<string, string | undefined> {
  // Never inherit a caller's real HOME/storage into tests or an explicit root.
  return { ...process.env, HOME: homeRoot(), ZCODE_STORAGE_DIR: zcodeStorageRoot() };
}

export function readZcodeNativeRecords(): NativeRecord[] {
  const file = zcodeRegistryFile();
  if (!existsSync(file)) return [];
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
  if (!isObject(value) || value['version'] !== 1 || !Array.isArray(value['plugins'])) return [];
  const out: NativeRecord[] = [];
  for (const row of value['plugins']) {
    if (!isObject(row)) continue;
    const id = text(row['id']); const name = text(row['name']); const marketplace = text(row['marketplace']);
    const version = text(row['version']); const installPath = text(row['installPath']);
    const scope = row['scope'];
    if (id === undefined || name === undefined || marketplace === undefined || version === undefined || installPath === undefined || (scope !== 'user' && scope !== 'workspace')) throw new Error(`Official ZCode registry has an unsupported plugin record: ${file}`);
    out.push({ id, name, marketplace, version, installPath, scope });
  }
  return out;
}

/** Writers fail closed rather than mistaking a corrupt native registry for an empty store. */
export function assertZcodeNativeRegistryReadable(): void {
  const file = zcodeRegistryFile();
  if (!existsSync(file)) return;
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`Official ZCode registry is invalid: ${file}`); }
  if (!isObject(value) || value['version'] !== 1 || !Array.isArray(value['plugins']) || value['plugins'].some(row => !isObject(row) || (row['scope'] !== 'user' && row['scope'] !== 'workspace'))) throw new Error(`Official ZCode registry is unsupported: ${file}`);
}

export function readZcodeOwnership(root: string): Ownership | null {
  const file = join(root, '.plgnz-install.json');
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!isObject(value) || value['owner'] !== 'plgnz' || value['schema'] !== 1) return null;
    const logicalId = text(value['logicalId']); const nativeId = text(value['nativeId']); const fingerprint = text(value['fingerprint']); const source = text(value['source']);
    const resourcePath = text(value['resourcePath']);
    return logicalId === undefined || nativeId === undefined || fingerprint === undefined || source === undefined ? null : { owner: 'plgnz', schema: 1, logicalId, nativeId, fingerprint, source, ...(resourcePath === undefined ? {} : { resourcePath }) };
  } catch { return null; }
}

/** Detection requires an explicit terminal CLI binary and official doctor shape. */
export function isOfficialZcodeCli(): boolean {
  const binary = zcodeCliBinary();
  if (binary === undefined || !existsSync(binary)) return false;
  try {
    const versionResult = Bun.spawnSync([binary, '--version'], { stdout: 'pipe', stderr: 'pipe', env: zcodeCliEnv(), timeout: 10_000 });
    if (versionResult.exitCode !== 0 || !(versionResult.stdout instanceof Uint8Array)) return false;
    const version = new TextDecoder().decode(versionResult.stdout).trim();
    if (/zcode-app-cli/iu.test(version) || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) return false;
    const result = Bun.spawnSync([binary, 'doctor', '--json'], { stdout: 'pipe', stderr: 'pipe', env: zcodeCliEnv(), timeout: 10_000 });
    if (result.exitCode !== 0 || !(result.stdout instanceof Uint8Array)) return false;
    const stdout = new TextDecoder().decode(result.stdout);
    if (/zcode-app-cli/iu.test(stdout)) return false;
    const value: unknown = JSON.parse(stdout);
    if (!isObject(value) || !isObject(value['cli'])) return false;
    return value['cli']['name'] === 'zcode' && value['cli']['processName'] === 'zcode-cli';
  } catch { return false; }
}

export function runOfficialZcode(args: string[]): string {
  const binary = zcodeCliBinary();
  if (binary === undefined || !isOfficialZcodeCli()) throw new Error('Official ZCode CLI required: set OPEN_PLUGIN_ZCODE_CLI_BIN to a binary whose doctor --json reports zcode/zcode-cli');
  const result = Bun.spawnSync([binary, ...args], { stdout: 'pipe', stderr: 'pipe', env: zcodeCliEnv(), timeout: 30_000 });
  const stdout = result.stdout instanceof Uint8Array ? new TextDecoder().decode(result.stdout) : '';
  const stderr = result.stderr instanceof Uint8Array ? new TextDecoder().decode(result.stderr) : '';
  if (result.exitCode !== 0) throw new Error(`Official ZCode CLI ${args.join(' ')} failed: ${(stderr || stdout).trim()}`);
  return stdout;
}

export const zcodeCli: HostReader = {
  id: 'zcode-cli',
  gui: false,
  detect: isOfficialZcodeCli,
  stores: () => [join(zcodeCliRoot(), 'plugins', 'cache'), zcodeMarketplaceRoot(), zcodeResourceRoot()],
  listInstalled(): InstalledPlugin[] {
    const enabled = readZcodeEnabledPluginIds();
    const seen = new Set<string>();
    return readZcodeNativeRecords().map((native) => {
      const root = zcodeSafeInstallRoot(native.installPath);
      const marker = root === undefined ? null : readZcodeOwnership(root);
      const owned = marker !== null && marker.nativeId === native.id;
      const id = owned ? marker.logicalId : native.id;
      if (seen.has(id)) throw new Error(`Official ZCode installed identity is ambiguous: ${id}`);
      seen.add(id);
      const at = id.indexOf('@');
      return {
        id,
        name: owned ? native.name : at < 0 ? id : id.slice(0, at),
        ...(owned ? { marketplace: marker.logicalId.includes('@') ? marker.logicalId.slice(marker.logicalId.indexOf('@') + 1) : undefined } : { marketplace: native.marketplace }),
        ...(root === undefined ? {} : { path: root, contentRoots: contentRoots(root, marker) }),
        version: native.version,
        enabled: enabled.get(native.id) === true,
      };
    });
  },
  mcpEntries: (): McpServerEntry[] => [],
};

export function zcodeSafeInstallRoot(path: string): string | undefined {
  try {
    const root = canonical(path); const cache = canonical(join(zcodeCliRoot(), 'plugins', 'cache'));
    if (!root.startsWith(`${cache}/`) || lstatSync(root).isSymbolicLink()) return undefined;
    return root;
  } catch { return undefined; }
}
function canonical(path: string): string {
  return realpathSync(path);
}
function contentRoots(native: string, marker: Ownership | null): Record<string, string> {
  const roots: Record<string, string> = { native };
  if (marker?.resourcePath !== undefined) {
    try {
      const resource = canonical(marker.resourcePath); const owned = canonical(zcodeResourceRoot());
      if (resource.startsWith(`${owned}/`)) roots['resources'] = resource;
    } catch { /* missing resources are reported by doctor through native fingerprint drift */ }
  }
  return roots;
}
export function readZcodeEnabledPluginIds(): Map<string, boolean> {
  const result = new Map<string, boolean>(); let globallyEnabled = true;
  for (const config of effectiveConfigPaths()) {
    let value: unknown; try { value = JSON.parse(readFileSync(config, 'utf8')); } catch { continue; }
    if (!isObject(value) || !isObject(value['plugins'])) continue;
    const plugins = value['plugins'];
    if (typeof plugins['enabled'] === 'boolean') globallyEnabled = plugins['enabled'];
    if (isObject(plugins['enabledPlugins'])) for (const [id, enabled] of Object.entries(plugins['enabledPlugins'])) if (typeof enabled === 'boolean') result.set(id, enabled);
  }
  if (!globallyEnabled) for (const id of result.keys()) result.set(id, false);
  return result;
}
function effectiveConfigPaths(): string[] {
  const paths = [join(zcodeCliConfigRoot(), 'config.json')]; const dirs: string[] = []; let current = resolve(process.cwd()); let foundWorktree = false;
  while (true) { dirs.push(current); if (existsSync(join(current, '.git'))) { foundWorktree = true; break; } const parent = dirname(current); if (parent === current) break; current = parent; }
  for (const dir of (foundWorktree ? dirs.reverse() : [dirs[0]!])) paths.push(join(dir, 'zcode.json'), join(dir, '.zcode', 'config.json'));
  return paths.filter(existsSync);
}
function text(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined; }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
