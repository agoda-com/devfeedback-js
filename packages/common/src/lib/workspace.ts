import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { isCommandPhase } from './phase';
import type { CommandPhase } from './types';

/** Markers of a workspace root, most specific first. */
const ROOT_MARKERS = ['pnpm-workspace.yaml', 'nx.json'];

/**
 * The repo root a package script or task belongs to: the nearest directory above
 * `start` holding a workspace marker, else the nearest one holding `.git`, else `start`.
 * Package scripts run with their own package as cwd, but config and state live at the root.
 */
export const workspaceRoot = (start: string = process.cwd()): string => {
  const from = resolve(start);
  const { root } = parse(from);
  let gitRoot: string | undefined;
  for (let dir = from; ; dir = dirname(dir)) {
    if (ROOT_MARKERS.some((m) => existsSync(join(dir, m)))) return dir;
    if (!gitRoot && existsSync(join(dir, '.git'))) gitRoot = dir;
    if (dir === root || dirname(dir) === dir) break;
  }
  return gitRoot ?? from;
};

export interface CommandConfig {
  /** script / target name → phase, checked before the built-in map */
  phases: Record<string, CommandPhase>;
  /** script / target names that are never recorded */
  skip: string[];
}

/**
 * Long-running commands: their duration is the length of the session, not a
 * measurement, and dev server time-to-ready already comes from the bundler plugins.
 */
export const DEFAULT_SKIP = ['dev', 'start', 'serve', 'watch'];

const cache = new Map<string, CommandConfig>();

/**
 * The `"devfeedback"` field of the root `package.json`:
 * `{ "phases": { "<name>": "<phase>" }, "skip": ["<name>", ...] }`.
 * A `skip` list replaces the default one. Read once per process and cached.
 */
export const readCommandConfig = (root: string): CommandConfig => {
  const cached = cache.get(root);
  if (cached) return cached;
  let config: CommandConfig = { phases: {}, skip: DEFAULT_SKIP };
  try {
    const field = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    )?.devfeedback;
    if (field && typeof field === 'object') {
      const phases: Record<string, CommandPhase> = {};
      if (
        field.phases &&
        typeof field.phases === 'object' &&
        !Array.isArray(field.phases)
      ) {
        // a typo must not reach ingestion as a phase of its own
        for (const [name, phase] of Object.entries(
          field.phases as Record<string, unknown>,
        )) {
          phases[name] = isCommandPhase(phase) ? phase : 'other';
        }
      }
      const skip = Array.isArray(field.skip)
        ? (field.skip as unknown[]).filter((s): s is string => typeof s === 'string')
        : DEFAULT_SKIP;
      config = { phases, skip };
    }
  } catch {
    /* no or unreadable package.json: defaults */
  }
  cache.set(root, config);
  return config;
};

/** test seam */
export const _resetCommandConfigCache = (): void => cache.clear();
