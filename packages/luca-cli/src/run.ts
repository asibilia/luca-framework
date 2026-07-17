#!/usr/bin/env bun
/**
 * Source entry point for running the `luca` CLI directly from TypeScript
 * (no build step). Used by acceptance/integration tests that spawn real
 * `luca` processes, and handy for local `bun packages/luca-cli/src/run.ts …`.
 */
import { runMain } from './cli.ts'

void runMain()
