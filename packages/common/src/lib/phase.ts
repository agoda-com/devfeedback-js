import type { CommandPhase } from './types';

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
