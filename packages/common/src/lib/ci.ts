const isSet = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';

/**
 * Local developer machines only. GitHub Actions, GitLab CI and most other CI systems
 * set `CI`; `DEVFEEDBACK_CI=true` opts a CI job back in.
 *
 * Applied by the command emitters (script-shell wrapper, Nx plugin). The bundler
 * plugins keep their existing behaviour.
 */
export const isCiSuppressed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  isSet(env.CI) && env.DEVFEEDBACK_CI !== 'true';
