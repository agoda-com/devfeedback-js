import { describe, it, expect } from 'vitest';
import { isCiSuppressed } from './ci';

describe('isCiSuppressed', () => {
  it('records on a developer machine', () => {
    expect(isCiSuppressed({})).toBe(false);
  });

  it.each(['true', '1', 'yes'])('suppresses when CI=%s', (value) => {
    expect(isCiSuppressed({ CI: value })).toBe(true);
  });

  it.each(['', '0', 'false', 'FALSE'])('treats CI=%j as not CI', (value) => {
    expect(isCiSuppressed({ CI: value })).toBe(false);
  });

  it('lets DEVFEEDBACK_CI=true opt a CI job back in', () => {
    expect(isCiSuppressed({ CI: 'true', DEVFEEDBACK_CI: 'true' })).toBe(false);
    expect(isCiSuppressed({ CI: 'true', DEVFEEDBACK_CI: '1' })).toBe(true);
  });
});
