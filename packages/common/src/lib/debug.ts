/**
 * Console output from a telemetry plugin is the fastest route to being deleted
 * from someone's config. Everything informational goes behind DEVFEEDBACK_DEBUG.
 */
export const isDebug = (): boolean => {
  const value = process.env.DEVFEEDBACK_DEBUG;
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const debugLog = (...args: any[]): void => {
  if (isDebug()) console.log(...args);
};

export const debugWarn = (...args: any[]): void => {
  if (isDebug()) console.warn(...args);
};

export const debugError = (...args: any[]): void => {
  if (isDebug()) console.error(...args);
};
