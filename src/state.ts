/**
 * open-plugin's own install ledger — `$OPEN_PLUGIN_HOME/state.json`
 * (see src/paths.ts `stateFile()`). Readers only: doctor imports this module,
 * so the writer (`writeState`) lives in src/state-write.ts — a module is
 * evaluated whole, and doctor must not load writer code (AGENTS.md).
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
 *       "installedAt": "2026-09-16T14:08:23.259Z",
 *       "pins": ["omakase"]                 // server names `pin` rewrote to an absolute path
 *     }
 *   ]
 * }
 *
 * `pins` (optional) is what `update` re-applies: re-adding a plugin restores
 * the source's bare `command`, so a recorded pin must be re-run on the fresh
 * copy. Absent means `pin` never rewrote anything for that install.
 */
import { readFileSync } from 'node:fs';
import { stateFile } from './paths';

export interface InstallRecord {
  host: string;
  id: string;
  source: string;
  sourceSha: string;
  installedAt?: string;
  /** Server names `pin` rewrote to an absolute path in this host's copy, sorted. */
  pins?: string[];
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
  const rawPins = rec['pins'];
  const pins = Array.isArray(rawPins)
    ? rawPins.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : undefined;
  const record: InstallRecord = { host, id, source, sourceSha };
  if (installedAt !== undefined) record.installedAt = installedAt;
  if (pins !== undefined && pins.length > 0) record.pins = pins;
  return record;
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
