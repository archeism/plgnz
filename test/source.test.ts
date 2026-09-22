import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { normalizeSource, resolveSource } from '../src/source';
import { fingerprintTree } from '../src/fingerprint';

function plugin(dir: string, name = 'fixture'): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
}

describe('resolveSource', () => {
  test('normalizes public owner/repo shorthand without treating it as local', () => {
    expect(normalizeSource('owner/repo')).toBe('https://github.com/owner/repo.git');
    expect(normalizeSource('./plugin')).toBe(resolve('./plugin'));
    expect(normalizeSource('../plugin')).toBe(resolve('../plugin'));
  });

  test('normalizes a relative local root and fingerprints its bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'plgnz-source-'));
    plugin(root);
    const first = resolveSource(root);
    writeFileSync(join(root, 'resource.md'), 'changed without a version bump\n');
    const second = resolveSource(root);

    expect(first.sourceUri).toBe(resolve(root));
    expect(first.plugins[0]?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.plugins[0]?.contentFingerprint === first.plugins[0]?.contentFingerprint).toBe(false);
  });

  test('uses a native-only Claude marketplace manifest for plugin identity and version', () => {
    const root = mkdtempSync(join(tmpdir(), 'plgnz-native-source-'));
    mkdirSync(join(root, '.claude-plugin'));
    writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'superpowers-dev', plugins: [{ source: './' }],
    }));
    writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({
      name: 'superpowers', version: '6.4.1', description: 'Native source fixture', nativeOnly: true,
    }));
    const plugin = resolveSource(root).plugins[0];
    expect(plugin?.name).toBe('superpowers');
    expect(plugin?.version).toBe('6.4.1');
    expect(plugin?.marketplace).toBe('superpowers-dev');
  });

  test('rejects conflicting canonical and native manifest identities', () => {
    for (const native of [
      { name: 'other', version: '1.0.0' },
      { name: 'fixture', version: '2.0.0' },
    ]) {
      const root = mkdtempSync(join(tmpdir(), 'plgnz-manifest-conflict-'));
      plugin(root, 'fixture');
      mkdirSync(join(root, '.claude-plugin'));
      writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify(native));
      expectThrow(() => resolveSource(root), 'Conflicting plugin manifest identity');
    }
  });

  test('rejects a malformed native manifest even when a canonical manifest is present', () => {
    const root = mkdtempSync(join(tmpdir(), 'plgnz-manifest-malformed-'));
    plugin(root, 'fixture');
    mkdirSync(join(root, '.claude-plugin'));
    writeFileSync(join(root, '.claude-plugin', 'plugin.json'), '{not json');
    expectThrow(() => resolveSource(root), 'Malformed plugin manifest');
  });

  test('rejects a collection that discovers no plugins', () => {
    const empty = mkdtempSync(join(tmpdir(), 'plgnz-empty-'));
    let error: Error | undefined;
    try { resolveSource(empty); } catch (caught) { error = caught as Error; }
    expect(error?.message).toContain('No plugins discovered');
  });

  test('rejects duplicate marketplace identities', () => {
    const root = mkdtempSync(join(tmpdir(), 'plgnz-duplicate-'));
    plugin(join(root, 'one'), 'same');
    plugin(join(root, 'two'), 'same');
    mkdirSync(join(root, '.claude-plugin'));
    writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'personal', plugins: [{ source: 'one' }, { source: 'two' }],
    }));
    let error: Error | undefined;
    try { resolveSource(root); } catch (caught) { error = caught as Error; }
    expect(error?.message).toContain('Duplicate plugin identity');
  });

  test('rejects malformed marketplace files and sources that escape their collection before fallback discovery', () => {
    const malformed = mkdtempSync(join(tmpdir(), 'plgnz-malformed-marketplace-'));
    plugin(malformed, 'fallback-must-not-win');
    mkdirSync(join(malformed, '.claude-plugin'));
    writeFileSync(join(malformed, '.claude-plugin', 'marketplace.json'), '{not json');
    expectThrow(() => resolveSource(malformed), 'Malformed marketplace manifest');

    const collection = mkdtempSync(join(tmpdir(), 'plgnz-escaped-marketplace-'));
    const outside = mkdtempSync(join(tmpdir(), 'plgnz-outside-plugin-'));
    plugin(outside, 'outside');
    writeFileSync(join(collection, 'marketplace.json'), JSON.stringify({ name: 'test', plugins: [{ source: '../' + outside.split('/').pop() }] }));
    expectThrow(() => resolveSource(collection), 'escapes collection root');

    const empty = mkdtempSync(join(tmpdir(), 'plgnz-empty-marketplace-'));
    mkdirSync(join(empty, '.claude-plugin'));
    plugin(join(empty, 'incidental'), 'incidental');
    writeFileSync(join(empty, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'test', plugins: [] }));
    expectThrow(() => resolveSource(empty), 'No plugins discovered in marketplace');
  });

  test('rejects plugin and marketplace identities that could escape a host store', () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'plgnz-unsafe-plugin-'));
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: '../../escape' }));
    expectThrow(() => resolveSource(pluginRoot), 'Unsafe plugin name');

    const marketplace = mkdtempSync(join(tmpdir(), 'plgnz-unsafe-marketplace-'));
    mkdirSync(join(marketplace, '.claude-plugin'));
    plugin(join(marketplace, 'safe'), 'safe');
    writeFileSync(join(marketplace, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: '../escape', plugins: [{ source: 'safe' }] }));
    expectThrow(() => resolveSource(marketplace), 'Unsafe marketplace name');
  });

  test('rejects every symlink and fingerprints binary resource bytes without UTF-8 collisions', () => {
    const linked = mkdtempSync(join(tmpdir(), 'plgnz-linked-source-'));
    plugin(linked);
    const target = join(linked, 'target.txt');
    writeFileSync(target, 'not a resource to follow');
    spawnSync('ln', ['-s', target, join(linked, 'linked.txt')]);
    expectThrow(() => resolveSource(linked), 'Symlink');

    const rootTarget = mkdtempSync(join(tmpdir(), 'plgnz-root-link-target-'));
    plugin(rootTarget);
    const rootLink = join(tmpdir(), `plgnz-root-link-${Date.now()}`);
    spawnSync('ln', ['-s', rootTarget, rootLink]);
    expectThrow(() => resolveSource(rootLink), 'Symlink');

    const first = mkdtempSync(join(tmpdir(), 'plgnz-binary-first-'));
    const second = mkdtempSync(join(tmpdir(), 'plgnz-binary-second-'));
    plugin(first);
    plugin(second);
    writeBytes(join(first, 'resource.bin'), [0x80]);
    writeBytes(join(second, 'resource.bin'), [0x81]);
    expect(resolveSource(first).plugins[0]?.contentFingerprint === resolveSource(second).plugins[0]?.contentFingerprint).toBe(false);
  });

  test('fingerprint framing cannot confuse file bytes with the next file record', () => {
    const first = mkdtempSync(join(tmpdir(), 'plgnz-framing-one-'));
    const second = mkdtempSync(join(tmpdir(), 'plgnz-framing-two-'));
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    writeBytes(join(first, 'a'), [88, 0, 102, 0, 98, 0, 89]);
    writeFileSync(join(second, 'a'), 'X');
    writeFileSync(join(second, 'b'), 'Y');
    expect(fingerprintTree(first) === fingerprintTree(second)).toBe(false);
  });
});

function expectThrow(fn: () => void, message: string): void {
  try {
    fn();
    throw new Error('expected function to throw');
  } catch (caught) {
    expect(caught instanceof Error ? caught.message : String(caught)).toContain(message);
  }
}

function writeBytes(path: string, bytes: number[]): void {
  const write = writeFileSync as unknown as (target: string, data: Uint8Array) => void;
  write(path, new Uint8Array(bytes));
}
