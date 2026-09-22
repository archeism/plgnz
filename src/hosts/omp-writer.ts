/** Transactional writer for OMP's measured copied-plugin store. */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type { PluginSource, ResolvedSource } from '../source';
import { omp, mcpCandidates, pluginsDir } from './omp';
import { pinPluginMcpFiles } from '../mcp-write';

const MARKER = '.plgnz-install.json';
type Ownership = { source: string; pluginId: string; fingerprint: string };
type Doc = Record<string, unknown>;

export const ompWriter: HostWriter = {
  ...omp,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void | 'unchanged'> {
    const market = plugin.marketplace || 'local';
    const id = `${plugin.name}@${market}`;
    for (const [label, value] of [['plugin', plugin.name], ['marketplace', market], ['version', resolved.sha]] as const) assertIdentity(value, label);
    const cache = join(pluginsDir(), 'cache', 'plugins');
    const target = join(cache, `${market}___${plugin.name}___${resolved.sha}`);
    assertUnder(cache, target);
    const registryFile = join(pluginsDir(), 'installed_plugins.json');
    const lockFile = join(pluginsDir(), 'omp-plugins.lock.json');
    const registry = readDoc(registryFile, { version: 2, plugins: {} }, 'registry');
    const lock = readDoc(lockFile, { plugins: {} }, 'lockfile');
    const registryPlugins = object(registry.plugins, 'registry plugins');
    const lockPlugins = object(lock.plugins, 'lockfile plugins');
    assertPriorRows(registryPlugins[id], id, cache, resolved.sourceUri);

    const stage = mkdtempSync(join(tmpdir(), '.plgnz-omp-stage-'));
    try {
      stagePlugin(plugin.dir, stage, plugin.name);
      writeFileSync(join(stage, MARKER), JSON.stringify({ source: resolved.sourceUri, pluginId: id, fingerprint: plugin.contentFingerprint ?? '' } satisfies Ownership));
      const marker = ownership(target);
      if (marker !== null && (marker.source !== resolved.sourceUri || marker.pluginId !== id)) throw new Error(`OMP plugin ${id} belongs to another source; refusing to replace it`);
      if (existsSync(target) && marker === null) throw new Error(`OMP cache target is unowned; refusing to replace it: ${target}`);
      const unchanged = marker !== null && marker.fingerprint === (plugin.contentFingerprint ?? '') && sameTree(stage, target);
      const now = new Date().toISOString();
      const nextRegistry: Doc = { ...registry, plugins: { ...registryPlugins, [id]: [...nonUserRows(registryPlugins[id]), { scope: 'user', installPath: target, version: resolved.sha, installedAt: now, lastUpdated: now }] } };
      const existingLock = lockPlugins[plugin.name];
      const priorLock: Doc = isDoc(existingLock) ? existingLock : {};
      const nextLock: Doc = { ...lock, plugins: { ...lockPlugins, [plugin.name]: { ...priorLock, version: resolved.sha, enabled: true } } };
      if (opts?.dryRun) {
        console.log(`[omp] would activate directory: ${target}`);
        console.log(`[omp] would update registry: ${registryFile}`);
        console.log(`[omp] would update lockfile: ${lockFile}`);
        return unchanged ? 'unchanged' : undefined;
      }
      mkdirSync(cache, { recursive: true });
      assertUnder(cache, target);
      const beforeRegistry = snapshot(registryFile); const beforeLock = snapshot(lockFile);
      if (unchanged) {
        try { writeDoc(registryFile, nextRegistry); writeDoc(lockFile, nextLock); }
        catch (error) { restore(registryFile, beforeRegistry); restore(lockFile, beforeLock); throw error; }
        return 'unchanged';
      }
      const activation = activate(stage, target, cache);
      try { writeDoc(registryFile, nextRegistry); writeDoc(lockFile, nextLock); }
      catch (error) { activation.rollback(); restore(registryFile, beforeRegistry); restore(lockFile, beforeLock); throw error; }
      // The registry and lock now select the new copy. Cleanup may fail but must not undo it.
      activation.commit();
      for (const row of userRows(registryPlugins[id])) {
        if (typeof row.installPath === 'string' && row.installPath !== target && ownership(row.installPath)?.source === resolved.sourceUri) rmSync(row.installPath, { recursive: true, force: true });
      }
    } finally { rmSync(stage, { recursive: true, force: true }); }
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const registryFile = join(pluginsDir(), 'installed_plugins.json'); const lockFile = join(pluginsDir(), 'omp-plugins.lock.json');
    const registry = readDoc(registryFile, { version: 2, plugins: {} }, 'registry'); const lock = readDoc(lockFile, { plugins: {} }, 'lockfile');
    const plugins = object(registry.plugins, 'registry plugins'); const rows = userRows(plugins[id]);
    if (rows.length === 0 || rows.some(row => typeof row.installPath !== 'string' || ownership(row.installPath)?.pluginId !== id)) throw new Error(`OMP user record ${id} is not wholly plgnz-owned; refusing to remove it`);
    const cache = join(pluginsDir(), 'cache', 'plugins');
    for (const row of rows) assertUnder(cache, row.installPath as string);
    const moved: Array<{ commit(): void; rollback(): void }> = []; const beforeRegistry = snapshot(registryFile); const beforeLock = snapshot(lockFile);
    try {
      for (const row of rows) moved.push(moveAside(row.installPath as string));
      const retained = nonUserRows(plugins[id]); const nextPlugins = { ...plugins }; if (retained.length) nextPlugins[id] = retained; else delete nextPlugins[id];
      const nextLockPlugins = { ...object(lock.plugins, 'lockfile plugins') }; delete nextLockPlugins[id.slice(0, id.indexOf('@'))];
      writeDoc(registryFile, { ...registry, plugins: nextPlugins }); writeDoc(lockFile, { ...lock, plugins: nextLockPlugins });
    } catch (error) { for (const backup of moved.reverse()) backup.rollback(); restore(registryFile, beforeRegistry); restore(lockFile, beforeLock); throw error; }
    // Durable removal is already committed; cleanup errors never recreate an active copy.
    for (const backup of moved) backup.commit();
  },
};

function stagePlugin(source: string, stage: string, name: string): void {
  assertNoSymlinks(source); cpSync(source, stage, { recursive: true });
  const manifest = join(stage, 'plugin.json'); let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(manifest, 'utf8')); } catch (error) { throw new Error(`invalid OMP plugin manifest: ${manifest} (${(error as Error).message})`); }
  if (!isDoc(parsed) || parsed.name !== name) throw new Error(`OMP manifest identity does not match ${name}`);
  if (existsSync(join(stage, 'commands')) || existsSync(join(stage, '.claude', 'commands'))) throw new Error('OMP command conversion/lifecycle is unverified; refusing to activate a plugin with commands');
  const skills = join(stage, 'skills');
  if (existsSync(skills)) {
    if (!statSync(skills).isDirectory()) throw new Error(`OMP skills path is not a directory: ${skills}`);
    for (const entry of readdirSync(skills)) {
      const skill = join(skills, entry, 'SKILL.md'); if (!existsSync(skill)) continue;
      if (/^---[\s\S]*?^disable-model-invocation\s*:/m.test(readFileSync(skill, 'utf8'))) throw new Error(`OMP marketplace skills do not support disable-model-invocation: ${skill}`);
    }
  }
  assertNoSymlinks(stage);
}
function readDoc(path: string, fallback: Doc, label: string): Doc { if (!existsSync(path)) return fallback; try { const value: unknown = JSON.parse(readFileSync(path, 'utf8')); if (!isDoc(value)) throw new Error('expected object'); return value; } catch (error) { throw new Error(`invalid OMP ${label}: ${path} (${(error as Error).message})`); } }
function object(value: unknown, label: string): Doc { if (!isDoc(value)) throw new Error(`invalid OMP ${label}`); return value; }
function isDoc(value: unknown): value is Doc { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function userRows(value: unknown): Array<Doc & { installPath?: unknown }> { return Array.isArray(value) ? value.filter((row): row is Doc & { installPath?: unknown } => isDoc(row) && row.scope === 'user') : []; }
function nonUserRows(value: unknown): unknown[] { return Array.isArray(value) ? value.filter(row => !isDoc(row) || row.scope !== 'user') : []; }
function ownership(path: string): Ownership | null { const marker = join(path, MARKER); if (!existsSync(marker)) return null; const value = readDoc(marker, {}, 'ownership marker'); if (typeof value.source !== 'string' || typeof value.pluginId !== 'string' || typeof value.fingerprint !== 'string') throw new Error(`invalid plgnz ownership marker: ${marker}`); return { source: value.source, pluginId: value.pluginId, fingerprint: value.fingerprint }; }
function assertPriorRows(value: unknown, id: string, cache: string, source: string): void { for (const row of userRows(value)) { if (typeof row.installPath !== 'string' || ownership(row.installPath)?.pluginId !== id || ownership(row.installPath)?.source !== source) throw new Error(`OMP user registry entry ${id} is not plgnz-owned by this source; refusing to replace it`); assertUnder(cache, row.installPath); } }
function writeDoc(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2)); }
function snapshot(path: string): string | undefined { return existsSync(path) ? readFileSync(path, 'utf8') : undefined; }
function restore(path: string, value: string | undefined): void { if (value === undefined) rmSync(path, { force: true }); else writeFileSync(path, value); }
function activate(stage: string, target: string, root: string): { commit(): void; rollback(): void } { if (!existsSync(target)) { renameSync(stage, target); return { commit: () => {}, rollback: () => rmSync(target, { recursive: true, force: true }) }; } const backupRoot = mkdtempSync(join(root, '.plgnz-omp-backup-')); const backup = join(backupRoot, 'previous'); renameSync(target, backup); try { renameSync(stage, target); } catch (error) { renameSync(backup, target); rmSync(backupRoot, { recursive: true, force: true }); throw error; } return { commit: () => rmSync(backupRoot, { recursive: true, force: true }), rollback: () => { rmSync(target, { recursive: true, force: true }); renameSync(backup, target); rmSync(backupRoot, { recursive: true, force: true }); } }; }
function moveAside(path: string): { commit(): void; rollback(): void } { const root = mkdtempSync(join(dirname(path), '.plgnz-omp-remove-')); const backup = join(root, 'previous'); renameSync(path, backup); return { commit: () => rmSync(root, { recursive: true, force: true }), rollback: () => { renameSync(backup, path); rmSync(root, { recursive: true, force: true }); } }; }
function sameTree(left: string, right: string): boolean { if (!existsSync(right)) return false; const bytes = readFileSync as unknown as (path: string) => Uint8Array; const list = (root: string): string[] => { const out: string[] = []; const walk = (dir: string, prefix: string): void => { for (const name of readdirSync(dir).sort()) { if (name === MARKER) continue; const path = join(dir, name); const rel = prefix ? `${prefix}/${name}` : name; const entry = lstatSync(path); if (entry.isSymbolicLink()) throw new Error(`OMP managed plugin contains symlink: ${path}`); if (entry.isDirectory()) walk(path, rel); else if (entry.isFile()) out.push(`${rel}:${Array.from(bytes(path)).join(',')}`); else throw new Error(`OMP managed plugin contains unsupported file: ${path}`); } }; walk(root, ''); return out; }; return JSON.stringify(list(left)) === JSON.stringify(list(right)); }
function assertNoSymlinks(root: string): void { const walk = (dir: string): void => { const entry = lstatSync(dir); if (entry.isSymbolicLink()) throw new Error(`OMP plugin contains symlink: ${dir}`); if (!entry.isDirectory()) throw new Error(`OMP plugin path is not a directory: ${dir}`); for (const name of readdirSync(dir)) { const path = join(dir, name); const child = lstatSync(path); if (child.isSymbolicLink()) throw new Error(`OMP plugin contains symlink: ${path}`); if (child.isDirectory()) walk(path); else if (!child.isFile()) throw new Error(`OMP plugin contains unsupported file: ${path}`); } }; walk(root); }
function assertIdentity(value: string, label: string): void { if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) throw new Error(`unsafe OMP ${label}: ${value}`); }
function assertUnder(root: string, path: string): void { const base = resolve(root); const candidate = resolve(path); if (!candidate.startsWith(`${base}/`)) throw new Error(`OMP managed path escapes its store: ${path}`); let current = base; if (existsSync(current)) assertDirectory(current); for (const part of candidate.slice(base.length).split('/').filter(Boolean)) { current = join(current, part); if (existsSync(current)) assertDirectory(current); } }
function assertDirectory(path: string): void { const entry = lstatSync(path); if (entry.isSymbolicLink()) throw new Error(`OMP managed path component is a symlink: ${path}`); if (!entry.isDirectory()) throw new Error(`OMP managed path component is not a directory: ${path}`); }
