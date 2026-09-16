#!/usr/bin/env bun
// open-plugin CLI shim — runs the TypeScript entrypoint directly under Bun.
import { main } from '../src/cli.ts';

process.exitCode = main(process.argv.slice(2));
