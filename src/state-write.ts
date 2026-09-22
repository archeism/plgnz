/**
 * The write side of the install ledger (src/state.ts) — `add`, `pin` and
 * `update` write through this; doctor imports only the readers, and a module
 * is evaluated whole, so keeping `writeState` out of src/state.ts keeps
 * writer code out of doctor's import graph (AGENTS.md;
 * test/doctor-imports.test.ts pins it).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { stateFile } from './paths';
import type { InstallRecord } from './state';

export function writeState(records: InstallRecord[], file: string = stateFile()): void {
  const parent = dirname(file);
  mkdirSync(parent, { recursive: true });
  const temporary = join(parent, `.${basename(file)}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify({ version: 1, installs: records }, null, 2));
    (fs as unknown as { renameSync(from: string, to: string): void }).renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
