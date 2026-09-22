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

export const writers: HostWriter[] = [claudeCodeWriter, codexWriter, kimiWriter, cursorWriter, ompWriter, piWriter];
