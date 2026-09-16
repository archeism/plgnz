/**
 * open-plugin's own install ledger — `$OPEN_PLUGIN_HOME/state.json`
 * (see src/paths.ts `stateFile()`). Written by `add` in a later phase;
 * doctor only reads it.
 *
 * Schema (version 1):
 * {
 *   "version": 1,
 *   "installs": [
 *     {
 *       "host": "claude-code",
 *       "id": "omakase@oh-my-ai-sdk",       // same id as listInstalled()
 *       "source": "/path/to/git/checkout",  // local git source whose HEAD is the freshness yardstick
 *       "sourceSha": "4f6f7f0a414e…",       // source HEAD at install time
 *       "installedAt": "2026-09-16T14:08:23.259Z"
 *     }
 *   ]
 * }
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { stateFile } from './paths';

export interface InstallRecord {
  host: string;
  id: string;
  source: string;
  sourceSha: string;
  installedAt?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function coerceInstall(v: unknown): InstallRecord | null {
  const rec = asRecord(v);
  if (!rec) return null;
  const host = typeof rec['host'] === 'string' ? rec['host'] : null;
  const id = typeof rec['id'] === 'string' ? rec['id'] : null;
  const source = typeof rec['source'] === 'string' ? rec['source'] : null;
  const sourceSha = typeof rec['sourceSha'] === 'string' ? rec['sourceSha'] : null;
  if (host === null || id === null || source === null || sourceSha === null) return null;
  const installedAt = typeof rec['installedAt'] === 'string' ? rec['installedAt'] : undefined;
  return installedAt === undefined ? { host, id, source, sourceSha } : { host, id, source, sourceSha, installedAt };
}

/** Read the ledger; a missing or malformed file is an empty ledger, never a crash. */
export function readState(file: string = stateFile()): InstallRecord[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  const installs = root === null ? undefined : root['installs'];
  if (!Array.isArray(installs)) return [];
  return installs.map(coerceInstall).filter((r): r is InstallRecord => r !== null);
}

/** Find the ledger row for one install on one host. */
export function findRecord(records: InstallRecord[], host: string, id: string): InstallRecord | undefined {
  return records.find((r) => r.host === host && r.id === id);
}

export function writeState(records: InstallRecord[], file: string = stateFile()): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, installs: records }, null, 2));
  } catch {}
}
