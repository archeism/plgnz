/**
 * The writer side of the host registry — `add`/`pin`/`update`/`remove`
 * consume this list; doctor never does (see src/hosts/index.ts for why the
 * two lists live in separate modules).
 */
import type { HostWriter } from '../host';
import { claudeCodeWriter } from './claude-code-writer';
import { codexWriter } from './codex-writer';
import { kimiWriter } from './kimi-writer';
import { cursorWriter } from './cursor-writer';
import { ompWriter } from './omp-writer';
import { piWriter } from './pi-writer';
import { dcodeWriter } from './dcode-writer';
import { opencodeWriter } from './opencode-writer';
import { zcodeCliWriter } from './zcode-cli-writer';

/** Active mutation routes: native plugin stores only. */
export const writers: HostWriter[] = [claudeCodeWriter, codexWriter, kimiWriter, cursorWriter, ompWriter, dcodeWriter, zcodeCliWriter];

/** Legacy standalone writers are retained solely to remove plgnz-owned installs safely. */
export const cleanupWriters: HostWriter[] = [...writers, piWriter, opencodeWriter];
