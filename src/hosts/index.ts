/**
 * Host registry. Doctor consumes this read-only list; writers (when they
 * arrive) are exported separately from each host module so doctor can never
 * import them.
 */
import type { HostReader, HostWriter } from '../host';
import { claudeCode, claudeCodeWriter } from './claude-code';
import { codex, codexWriter } from './codex';
import { kimi, kimiWriter } from './kimi';
import { cursor, cursorWriter } from './cursor';
import { omp, ompWriter } from './omp';

export const hosts: HostReader[] = [claudeCode, codex, kimi, cursor, omp];
export const writers: HostWriter[] = [claudeCodeWriter, codexWriter, kimiWriter, cursorWriter, ompWriter];
