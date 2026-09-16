/**
 * The write side of the install ledger (src/state.ts) — `add`, `pin` and
 * `update` write through this; doctor imports only the readers, and a module
 * is evaluated whole, so keeping `writeState` out of src/state.ts keeps
 * writer code out of doctor's import graph (AGENTS.md;
 * test/doctor-imports.test.ts pins it).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stateFile } from './paths';
import type { InstallRecord } from './state';

export function writeState(records: InstallRecord[], file: string = stateFile()): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, installs: records }, null, 2));
  } catch {}
}
