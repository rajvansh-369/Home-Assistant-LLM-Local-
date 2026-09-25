// Build-time values the app reads at run time (app.config.ts `extra`).
import Constants from 'expo-constants';

type Extra = { homeLlmHost?: unknown; hasMapsKey?: unknown };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * HOME_LLM_HOST from .env: the only host a release build may call over plain http (plan §7).
 * Strings only: Expo embeds a null config value as {} in release builds.
 */
export const homeLlmHost: string | null =
  (typeof extra.homeLlmHost === 'string' && extra.homeLlmHost.trim()) || null;

/** GOOGLE_MAPS_API_KEY was set at build time; Google Maps crashes without one. */
export const hasMapsKey = extra.hasMapsKey === true;

/** Release builds enforce the cleartext rule; debug builds allow any http host. */
export const isReleaseBuild = !__DEV__;
