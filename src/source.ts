import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, isAbsolute, resolve } from 'node:path';
import { cacheRoot } from './paths';
import { isGitUrl } from './exec';
import { fingerprintTree } from './fingerprint';

export interface PluginSource {
  dir: string;
  name: string;
  version?: string;
  marketplace?: string;
  /** Stable digest of the source directory bytes, independent of version/SHA. */
  contentFingerprint?: string;
}

/** Identity fields shared by canonical Agent Plugins and supported native inputs. */
export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
}

export interface ResolvedSource {
  sourceUri: string;
  sha: string;
  isGit: boolean;
  plugins: PluginSource[];
}

export function resolveSource(source: string): ResolvedSource {
  const sourceUri = normalizeSource(source);
  const isGit = isGitUrl(sourceUri);
  let targetDir = sourceUri;
  let sha = 'local';
  
  if (isGit) {
    const ls = spawnSync('git', ['ls-remote', sourceUri, 'HEAD'], { encoding: 'utf8' });
    if (ls.status !== 0) throw new Error(`Failed to resolve git remote: ${sourceUri}`);
    sha = ls.stdout.split('\t')[0] || '';
    if (!sha || sha.length !== 40) throw new Error(`Invalid sha from git ls-remote: ${sha}`);
    
    const cacheDir = cacheRoot();
    mkdirSync(cacheDir, { recursive: true });
    targetDir = join(cacheDir, sha);
    
    if (!existsSync(targetDir)) {
      const clone = spawnSync('git', ['clone', '--depth=1', sourceUri, targetDir]);
      if (clone.status !== 0) throw new Error(`Failed to clone ${sourceUri}`);
    }
  } else {
    // An absolute source (what `add` records in state.json, and what `update`
    // feeds back) must not be re-rooted at the cwd — path.join does not reset
    // on an absolute second argument.
    targetDir = sourceUri;
    if (!existsSync(targetDir)) throw new Error(`Local source not found: ${targetDir}`);
    const rev = spawnSync('git', ['-C', targetDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (rev.status === 0) {
      const match = rev.stdout.trim().match(/^[0-9a-f]{40}$/i);
      if (match) sha = match[0];
    }
  }
  targetDir = assertSafeSourceTree(targetDir);

  const plugins: PluginSource[] = [];
  
  // 1. Marketplace index
  const mp1 = join(targetDir, '.claude-plugin', 'marketplace.json');
  const mp2 = join(targetDir, '.omp-plugin', 'marketplace.json');
  const mp3 = join(targetDir, 'marketplace.json');
  const mpPath = existsSync(mp1) ? mp1 : existsSync(mp2) ? mp2 : existsSync(mp3) ? mp3 : null;
  
  if (mpPath !== null) {
    const data = parseMarketplace(mpPath);
    const marketplaceName = typeof data['name'] === 'string' ? data['name'] : 'local';
    assertSafeIdentity(marketplaceName, 'marketplace name');
    const entries = data['plugins'];
    if (!Array.isArray(entries)) throw new Error(`Malformed marketplace manifest: plugins must be an array (${mpPath})`);
    if (entries.length === 0) throw new Error(`No plugins discovered in marketplace: ${mpPath}`);
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry['source'] !== 'string' || entry['source'].trim() === '') {
        throw new Error(`Malformed marketplace manifest: every plugin needs a source (${mpPath})`);
      }
      const pDir = resolve(targetDir, entry['source']);
      if (!isInside(targetDir, pDir)) throw new Error(`Marketplace plugin source escapes collection root: ${entry['source']}`);
      if (!existsSync(pDir) || !statSync(pDir).isDirectory()) throw new Error(`Marketplace plugin source is not a directory: ${entry['source']}`);
      plugins.push(pluginFromDir(pDir, marketplaceName));
    }
  }
  
  if (plugins.length > 0) return resolvedSource(sourceUri, sha, isGit, plugins);

  // 2. Root plugin
  if (isPluginDir(targetDir)) {
    plugins.push(pluginFromDir(targetDir));
    return resolvedSource(sourceUri, sha, isGit, plugins);
  }

  // 3. Recursive scan (1 level deep)
  for (const entry of readdirSync(targetDir)) {
    const subDir = join(targetDir, entry);
    if (statSync(subDir).isDirectory() && isPluginDir(subDir)) {
      plugins.push(pluginFromDir(subDir));
    }
  }
  
  if (plugins.length === 0) throw new Error(`No plugins discovered in source: ${sourceUri}`);
  return resolvedSource(sourceUri, sha, isGit, plugins);
}

function resolvedSource(sourceUri: string, sha: string, isGit: boolean, plugins: PluginSource[]): ResolvedSource {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    const identity = `${plugin.name}@${plugin.marketplace ?? 'local'}`;
    if (seen.has(identity)) throw new Error(`Duplicate plugin identity discovered: ${identity}`);
    seen.add(identity);
  }
  return { sourceUri, sha, isGit, plugins };
}

/** Owner/repo is the public GitHub shorthand; all local roots become absolute. */
export function normalizeSource(source: string): string {
  if (source.startsWith('./') || source.startsWith('../') || isAbsolute(source)) return resolve(source);
  if (/^[^/\s]+\/[^/\s]+$/.test(source)) return `https://github.com/${source}.git`;
  if (isGitUrl(source)) return source;
  return resolve(source);
}

function withFingerprint(plugin: PluginSource): PluginSource {
  return { ...plugin, contentFingerprint: fingerprintTree(plugin.dir) };
}

function pluginFromDir(dir: string, marketplace?: string): PluginSource {
  const manifest = readPluginManifest(dir);
  const name = manifest?.name ?? inferredPluginName(dir);
  return withFingerprint({ dir, name, ...(manifest?.version === undefined ? {} : { version: manifest.version }), ...(marketplace === undefined ? {} : { marketplace }) });
}

function assertSafeSourceTree(path: string): string {
  assertNoSymlinks(path);
  const canonical = realpath(path);
  assertNoSymlinks(canonical);
  return canonical;
}

function assertNoSymlinks(path: string): void {
  const links = spawnSync('find', [path, '-type', 'l', '-print'], { encoding: 'utf8' });
  if (links.status !== 0) throw new Error(`Could not inspect source tree: ${path}`);
  if (links.stdout.trim() !== '') throw new Error(`Symlink resources are not supported: ${links.stdout.trim()}`);
}

function parseMarketplace(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('manifest must be an object');
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed marketplace manifest: ${path} (${detail})`);
  }
}

function realpath(path: string): string {
  const result = spawnSync('realpath', [path], { encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() === '') throw new Error(`Could not resolve source path: ${path}`);
  return result.stdout.trim();
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPluginDir(dir: string): boolean {
  return manifestPaths(dir).some(existsSync) || existsSync(join(dir, '.mcp.json')) || existsSync(join(dir, 'mcp.json'));
}

/**
 * Canonical manifests take precedence. `.claude-plugin/plugin.json` is a
 * supported source-only fallback; it is never rewritten into a source tree.
 */
export function readPluginManifest(dir: string): PluginManifest | undefined {
  let selected: PluginManifest | undefined;
  for (const path of manifestPaths(dir)) {
    if (!existsSync(path)) continue;
    const current = parsePluginManifest(path);
    if (selected === undefined) {
      selected = current;
      continue;
    }
    if (current.name !== selected.name || (current.version !== undefined && selected.version !== undefined && current.version !== selected.version)) {
      throw new Error(`Conflicting plugin manifest identity: ${path}`);
    }
  }
  return selected;
}

function manifestPaths(dir: string): string[] {
  return [join(dir, 'plugin.json'), join(dir, '.plugin', 'plugin.json'), join(dir, '.claude-plugin', 'plugin.json')];
}

function parsePluginManifest(path: string): PluginManifest {
  let data: unknown;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`Malformed plugin manifest: ${path} (${(error as Error).message})`); }
  if (!isRecord(data) || typeof data['name'] !== 'string') throw new Error(`Plugin manifest needs a name: ${path}`);
  assertSafeIdentity(data['name'], 'plugin name');
  if (data['version'] !== undefined && (typeof data['version'] !== 'string' || data['version'].trim() === '')) throw new Error(`Plugin manifest version is invalid: ${path}`);
  if (data['description'] !== undefined && typeof data['description'] !== 'string') throw new Error(`Plugin manifest description is invalid: ${path}`);
  return { name: data['name'], ...(typeof data['version'] === 'string' ? { version: data['version'] } : {}), ...(typeof data['description'] === 'string' ? { description: data['description'] } : {}) };
}

function inferredPluginName(dir: string): string {
  const inferred = basename(dir);
  assertSafeIdentity(inferred, 'plugin name');
  return inferred;
}

function assertSafeIdentity(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) throw new Error(`Unsafe ${label}: ${value}`);
}
