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
import { existsSync, readFileSync } from 'node:fs';
import { stateFile } from './paths';

export interface InstallRecord {
  host: string;
  id: string;
  source: string;
  sourceSha: string;
  installedAt?: string;
  /** Server names `pin` rewrote to an absolute path in this host's copy, sorted. */
  pins?: string[];
  /** Reserved for the content-based refresh increment; legacy records remain valid. */
  fingerprint?: string;
  /** Canonical selected package directory whose bytes produced `fingerprint`. */
  sourceDir?: string;
  /** Raw-byte fingerprint of the activated host-native representation. */
  installedFingerprint?: string;
  /** Reserved for explicit owned-artifact cleanup; legacy records remain valid. */
  ownership?: string;
  /** Durable intent written before a host mutation and cleared only after it completes. */
  pending?: 'install' | 'remove';
}

const RECORD_FIELDS = new Set(['host', 'id', 'source', 'sourceSha', 'installedAt', 'pins', 'fingerprint', 'sourceDir', 'installedFingerprint', 'ownership', 'pending']);

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function coerceInstall(v: unknown): InstallRecord {
  const rec = asRecord(v);
  if (!rec) throw new Error('Invalid state.json: install record must be an object');
  const unknown = Object.keys(rec).find((key) => !RECORD_FIELDS.has(key));
  if (unknown !== undefined) throw new Error(`Invalid state.json: unsupported install field '${unknown}'`);
  const host = typeof rec['host'] === 'string' ? rec['host'] : null;
  const id = typeof rec['id'] === 'string' ? rec['id'] : null;
  const source = typeof rec['source'] === 'string' ? rec['source'] : null;
  const sourceSha = typeof rec['sourceSha'] === 'string' ? rec['sourceSha'] : null;
  if (host === null || id === null || source === null || sourceSha === null) {
    throw new Error('Invalid state.json: install record is missing required fields');
  }
  if (rec['installedAt'] !== undefined && typeof rec['installedAt'] !== 'string') throw new Error('Invalid state.json: installedAt must be a string');
  if (rec['pins'] !== undefined && (!Array.isArray(rec['pins']) || rec['pins'].some((pin) => typeof pin !== 'string' || pin.length === 0))) {
    throw new Error('Invalid state.json: pins must be non-empty strings');
  }
  if (rec['fingerprint'] !== undefined && typeof rec['fingerprint'] !== 'string') throw new Error('Invalid state.json: fingerprint must be a string');
  if (rec['sourceDir'] !== undefined && typeof rec['sourceDir'] !== 'string') throw new Error('Invalid state.json: sourceDir must be a string');
  if (rec['installedFingerprint'] !== undefined && typeof rec['installedFingerprint'] !== 'string') throw new Error('Invalid state.json: installedFingerprint must be a string');
  if (rec['ownership'] !== undefined && typeof rec['ownership'] !== 'string') throw new Error('Invalid state.json: ownership must be a string');
  if (rec['pending'] !== undefined && rec['pending'] !== 'install' && rec['pending'] !== 'remove') throw new Error('Invalid state.json: pending must be install or remove');
  const installedAt = rec['installedAt'] as string | undefined;
  const rawPins = rec['pins'];
  const pins = rawPins as string[] | undefined;
  const record: InstallRecord = { host, id, source, sourceSha };
  if (installedAt !== undefined) record.installedAt = installedAt;
  if (pins !== undefined && pins.length > 0) record.pins = pins;
  if (typeof rec['fingerprint'] === 'string') record.fingerprint = rec['fingerprint'];
  if (typeof rec['sourceDir'] === 'string') record.sourceDir = rec['sourceDir'];
  if (typeof rec['installedFingerprint'] === 'string') record.installedFingerprint = rec['installedFingerprint'];
  if (typeof rec['ownership'] === 'string') record.ownership = rec['ownership'];
  if (rec['pending'] === 'install' || rec['pending'] === 'remove') record.pending = rec['pending'];
  return record;
}

/** Read the ledger; a missing file is empty, while corrupt state is surfaced. */
export function readState(file: string = stateFile()): InstallRecord[] {
  if (!existsSync(file)) return [];
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read state.json: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid state.json: ${(error as Error).message}`);
  }
  const root = asRecord(parsed);
  if (root === null) throw new Error('Invalid state.json: root must be an object');
  const unknownRoot = Object.keys(root).find((key) => key !== 'version' && key !== 'installs');
  if (unknownRoot !== undefined) throw new Error(`Invalid state.json: unsupported root field '${unknownRoot}'`);
  if (root['version'] !== 1) throw new Error(`Unsupported state.json version: ${String(root['version'])}`);
  const installs = root['installs'];
  if (!Array.isArray(installs)) throw new Error('Invalid state.json: installs must be an array');
  return installs.map(coerceInstall);
}

/** Find the ledger row for one install on one host. */
export function findRecord(records: InstallRecord[], host: string, id: string): InstallRecord | undefined {
  return records.find((r) => r.host === host && r.id === id);
}
