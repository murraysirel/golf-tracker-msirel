// ─────────────────────────────────────────────────────────────────
// FEATURE FLAGS — hidden infrastructure, not deployed until enabled
// ─────────────────────────────────────────────────────────────────

const FLAGS = {
  PREMIUM_ENABLED: false, // Flip to true when ready to deploy subscription flow
};

export function isEnabled(flag) {
  return FLAGS[flag] === true;
}
