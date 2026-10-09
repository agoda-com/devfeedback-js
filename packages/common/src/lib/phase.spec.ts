import { describe, it, expect } from 'vitest';
import { phaseFor } from './phase';

describe('phaseFor', () => {
  it.each([
    ['typecheck', 'typecheck'],
    ['type-check', 'typecheck'],
    ['tsc', 'typecheck'],
    ['check-types', 'typecheck'],
    ['lint', 'lint'],
    ['eslint', 'lint'],
    ['lint:fix', 'lint'],
    ['test', 'test'],
    ['test:unit', 'test'],
    ['vitest', 'test'],
    ['jest', 'test'],
    ['build', 'build'],
    ['build:prod', 'build'],
    ['codegen', 'codegen'],
    ['generate', 'codegen'],
    ['gen:api', 'codegen'],
  ])('maps %s to %s', (name, phase) => {
    expect(phaseFor(name)).toBe(phase);
  });

  it.each(['e2e', 'format', 'storybook', 'prebuild', 'testing', 'gen'])(
    'maps unmatched %s to other',
    (name) => {
      expect(phaseFor(name)).toBe('other');
    },
  );

  it('lets a per-repo override win over the built-in map', () => {
    expect(phaseFor('e2e', { e2e: 'test' })).toBe('test');
    expect(phaseFor('build', { build: 'codegen' })).toBe('codegen');
  });
});
