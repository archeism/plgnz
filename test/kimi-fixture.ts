/** Isolated current-Kimi Code Server API fixture for Kimi lifecycle tests. */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function kimiNativeEnv(home: string): Record<string, string> {
  const binary = join(home, 'fake-kimi-current');
  mkdirSync(home, { recursive: true });
  writeFileSync(binary, `#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
if (process.argv.includes('--version')) { console.log('2.0.1'); process.exit(0); }
const home = process.env.KIMI_CODE_HOME; const port = Number(process.argv[process.argv.indexOf('--port') + 1]); const registry = join(home, 'plugins', 'installed.json');
mkdirSync(join(registry, '..'), { recursive: true }); writeFileSync(join(home, 'server.token'), 'fixture-token\\n'); let plugins = existsSync(registry) ? JSON.parse(readFileSync(registry, 'utf8')).plugins : [];
const save = () => writeFileSync(registry, JSON.stringify({ version: 1, plugins }, null, 2));
Bun.serve({ hostname: '127.0.0.1', port, fetch: async (request) => { const url = new URL(request.url); if (url.pathname === '/api/v1/healthz') return Response.json({ code: 0, data: { ok: true } }); if (request.headers.get('authorization') !== 'Bearer fixture-token') return Response.json({ code: 401, msg: 'unauthorized' }); if (url.pathname === '/api/v1/plugins' && request.method === 'POST') { if (process.env.KIMI_FAIL_INSTALL === '1') return Response.json({ code: 9, msg: 'forced failure' }); const { source } = await request.json(); const id = basename(source); const target = join(home, 'plugins', 'managed', id); rmSync(target, { recursive: true, force: true }); mkdirSync(join(target, '..'), { recursive: true }); cpSync(source, target, { recursive: true }); let recordedTarget = target; if (process.env.KIMI_CANONICALIZE_ROOT === '1') { const alias = join(home, 'registry-managed-alias'); rmSync(alias, { force: true }); symlinkSync(join(home, 'plugins', 'managed'), alias); recordedTarget = join(alias, id); } plugins = plugins.filter((row) => row.id !== id); plugins.push({ id, root: recordedTarget, enabled: false }); save(); return Response.json({ code: 0, data: {} }); } const enable = /^\\/api\\/v1\\/plugins\\/([^/]+):enable$/.exec(url.pathname); if (enable) { if (process.env.KIMI_FAIL_ENABLE === '1') return Response.json({ code: 9, msg: 'forced enable failure' }); const row = plugins.find((item) => item.id === decodeURIComponent(enable[1])); row.enabled = true; save(); return Response.json({ code: 0, data: {} }); } const remove = /^\\/api\\/v1\\/plugins\\/([^/]+):remove$/.exec(url.pathname); if (remove) { plugins = plugins.filter((item) => item.id !== decodeURIComponent(remove[1])); save(); return Response.json({ code: 0, data: { ok: true } }); } if (url.pathname === '/api/v1/shutdown') { setTimeout(() => process.exit(0), 10); return Response.json({ code: 0, data: {} }); } return Response.json({ code: 404, msg: 'missing' }); }});
`);
  chmodSync(binary, 0o755);
  return { OPEN_PLUGIN_KIMI_BIN: binary };
}

export async function withKimiNative<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env.OPEN_PLUGIN_KIMI_BIN;
  // Existing static Kimi fixtures model an unowned prior install. Native-route
  // tests start from an isolated empty store and create ownership through add.
  resetKimiNativeStore(home);
  process.env.OPEN_PLUGIN_KIMI_BIN = kimiNativeEnv(home).OPEN_PLUGIN_KIMI_BIN;
  try { return await fn(); }
  finally { if (before === undefined) delete process.env.OPEN_PLUGIN_KIMI_BIN; else process.env.OPEN_PLUGIN_KIMI_BIN = before; }
}

export function resetKimiNativeStore(home: string): void {
  rmSync(join(home, '.kimi-code', 'plugins', 'managed'), { recursive: true, force: true });
  rmSync(join(home, '.kimi-code', 'plugins', 'installed.json'), { force: true });
}
