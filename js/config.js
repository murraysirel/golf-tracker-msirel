// ─────────────────────────────────────────────────────────────────
// RUNTIME CONFIG — web vs native (Capacitor)
// Leaf module with no app imports — safe to import from anywhere.
// ─────────────────────────────────────────────────────────────────

const isNative = !!window.Capacitor?.isNativePlatform?.();

// Prepended to all /.netlify/functions/... URLs.
// Web: '' (relative paths resolve against Netlify origin)
// Native: full origin so fetch hits the real server
export const API_BASE = isNative ? 'https://loopercaddie.com' : '';

// Public-facing origin for share URLs, invite links, etc.
// On native, window.location.origin would be capacitor://localhost.
export const APP_ORIGIN = isNative
  ? 'https://loopercaddie.com'
  : window.location.origin;

// Simple boolean for conditional logic (Sentry env, guards, etc.)
export const IS_NATIVE = isNative;
