/**
 * Host registry. Doctor consumes this read-only list; writers (when they
 * arrive) are exported separately from each host module so doctor can never
 * import them.
 */
import type { HostReader } from '../host';
import { claudeCode } from './claude-code';
import { codex } from './codex';
import { kimi } from './kimi';
import { cursor } from './cursor';
import { omp } from './omp';

export const hosts: HostReader[] = [claudeCode, codex, kimi, cursor, omp];
