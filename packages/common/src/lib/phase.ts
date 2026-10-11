import type { CommandPhase } from './types';

const PHASES: Record<CommandPhase, true> = {
  install: true,
  codegen: true,
  typecheck: true,
  lint: true,
  test: true,
  build: true,
  devserver: true,
  clientready: true,
  other: true,
};

export const isCommandPhase = (value: unknown): value is CommandPhase =>
  typeof value === 'string' && Object.hasOwn(PHASES, value);

const RULES: Array<[RegExp, CommandPhase]> = [
  [/^(typecheck|type-check|tsc|check-types)(:.*)?$/, 'typecheck'],
  [/^(lint|eslint)(:.*)?$/, 'lint'],
  [/^(test|vitest|jest)(:.*)?$/, 'test'],
  [/^build(:.*)?$/, 'build'],
  [/^(codegen|generate)(:.*)?$/, 'codegen'],
  [/^gen:.+$/, 'codegen'],
];

/**
 * The one mapping from a package script or task-runner target name to a phase, shared
 * by every command emitter. A per-repo override wins; anything unmatched is `other`,
 * with the name itself reported in `target`.
 */
export const phaseFor = (
  name: string,
  overrides: Record<string, CommandPhase> = {},
): CommandPhase => {
  const override = overrides[name];
  if (override) return override;
  for (const [pattern, phase] of RULES) {
    if (pattern.test(name)) return phase;
  }
  return 'other';
};
