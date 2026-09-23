/**
 * Host registry — readers only.
 *
 * doctor imports `hosts` from here, and doctor is read-only by construction
 * (AGENTS.md: it must not import any writer). A module is evaluated whole,
 * so honoring that at module granularity means writers cannot live in the
 * reader files: each host's writer is a sibling `<host>-writer.ts`, and the
 * writer list is aggregated in src/hosts/writers.ts — a module this index
 * never imports. test/doctor-imports.test.ts walks doctor's import graph and
 * fails if a writer creeps back into it.
 */
import type { HostReader } from '../host';
import { claudeCode } from './claude-code';
import { codex } from './codex';
import { kimi } from './kimi';
import { cursor } from './cursor';
import { omp } from './omp';
import { pi } from './pi';
import { dcode } from './dcode';
import { opencode } from './opencode';
import { zcodeCli } from './zcode-cli';

export const hosts: HostReader[] = [claudeCode, codex, kimi, cursor, omp, pi, dcode, opencode, zcodeCli];
