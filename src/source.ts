import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, isAbsolute } from 'node:path';
import { homeRoot } from './paths';

export interface PluginSource {
  dir: string;
  name: string;
  version?: string;
  marketplace?: string;
}

export interface ResolvedSource {
  sourceUri: string;
  sha: string;
  isGit: boolean;
  plugins: PluginSource[];
}

export function resolveSource(source: string): ResolvedSource {
  const isGit = source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@');
  let targetDir = source;
  let sha = 'local';
  
  if (isGit) {
    const ls = spawnSync('git', ['ls-remote', source, 'HEAD'], { encoding: 'utf8' });
    if (ls.status !== 0) throw new Error(`Failed to resolve git remote: ${source}`);
    sha = ls.stdout.split('\t')[0] || '';
    if (!sha || sha.length !== 40) throw new Error(`Invalid sha from git ls-remote: ${sha}`);
    
    const openPluginHome = process.env['OPEN_PLUGIN_HOME'] || homeRoot();
    const cacheDir = join(openPluginHome, 'cache');
    mkdirSync(cacheDir, { recursive: true });
    targetDir = join(cacheDir, sha);
    
    if (!existsSync(targetDir)) {
      const clone = spawnSync('git', ['clone', '--depth=1', source, targetDir]);
      if (clone.status !== 0) throw new Error(`Failed to clone ${source}`);
    }
  } else {
    // An absolute source (what `add` records in state.json, and what `update`
    // feeds back) must not be re-rooted at the cwd — path.join does not reset
    // on an absolute second argument.
    targetDir = isAbsolute(source) ? source : join(process.cwd(), source);
    if (!existsSync(targetDir)) throw new Error(`Local source not found: ${targetDir}`);
    const rev = spawnSync('git', ['-C', targetDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (rev.status === 0) {
      const match = rev.stdout.trim().match(/^[0-9a-f]{40}$/i);
      if (match) sha = match[0];
    }
  }

  const plugins: PluginSource[] = [];
  
  // 1. Marketplace index
  const mp1 = join(targetDir, '.claude-plugin', 'marketplace.json');
  const mp2 = join(targetDir, '.omp-plugin', 'marketplace.json');
  const mp3 = join(targetDir, 'marketplace.json');
  const mpPath = existsSync(mp1) ? mp1 : existsSync(mp2) ? mp2 : existsSync(mp3) ? mp3 : null;
  
  if (mpPath) {
    try {
      const data = JSON.parse(readFileSync(mpPath, 'utf8'));
      const marketplaceName = data.name || 'local';
      if (Array.isArray(data.plugins)) {
        for (const p of data.plugins) {
          if (p.source) {
            const pDir = join(targetDir, p.source);
            plugins.push({ dir: pDir, name: readPluginName(pDir), marketplace: marketplaceName });
          }
        }
      }
    } catch {}
  }
  
  if (plugins.length > 0) return { sourceUri: source, sha, isGit, plugins };

  // 2. Root plugin
  if (isPluginDir(targetDir)) {
    plugins.push({ dir: targetDir, name: readPluginName(targetDir) });
    return { sourceUri: source, sha, isGit, plugins };
  }

  // 3. Recursive scan (1 level deep)
  for (const entry of readdirSync(targetDir)) {
    const subDir = join(targetDir, entry);
    if (statSync(subDir).isDirectory() && isPluginDir(subDir)) {
      plugins.push({ dir: subDir, name: readPluginName(subDir) });
    }
  }
  
  return { sourceUri: source, sha, isGit, plugins };
}

function isPluginDir(dir: string): boolean {
  return existsSync(join(dir, '.plugin', 'plugin.json')) || existsSync(join(dir, 'plugin.json')) || existsSync(join(dir, '.mcp.json')) || existsSync(join(dir, 'mcp.json'));
}

function readPluginName(dir: string): string {
  const p1 = join(dir, '.plugin', 'plugin.json');
  const p2 = join(dir, 'plugin.json');
  let p = existsSync(p1) ? p1 : existsSync(p2) ? p2 : null;
  if (!p) {
    return basename(dir);
  }
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return typeof data.name === 'string' ? data.name : basename(dir);
  } catch {
    return basename(dir);
  }
}
