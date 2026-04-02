// ─────────────────────────────────────────────────────────────────
// SUBSCRIPTION — premium gatekeeping (hidden until PREMIUM_ENABLED)
// ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { isEnabled } from './flags.js';

// ── Tier Matrix ──────────────────────────────────────────────────
const FREE_LIMITS = {
  ai_reviews: 1,        // per month
  practice_sessions: 1, // per month
  league_boards: 3,     // stableford, net_score, buffer
  competitions: false,   // no access
  stats_analysis: false, // no access
};

const FREE_BOARD_IDS = ['stableford', 'net_score', 'buffer'];

// ── State ────────────────────────────────────────────────────────

export function isPremium() {
  if (!isEnabled('PREMIUM_ENABLED')) return true; // flag off = everything unlocked
  return state.subscription?.tier === 'premium';
}

export function getSubscriptionTier() {
  if (!isEnabled('PREMIUM_ENABLED')) return 'premium';
  return state.subscription?.tier || 'free';
}

// ── Access checks ────────────────────────────────────────────────

export function checkAccess(feature) {
  if (!isEnabled('PREMIUM_ENABLED')) return true;
  if (isPremium()) return true;

  const limit = FREE_LIMITS[feature];
  if (limit === false) return false;
  if (typeof limit === 'number') {
    const usage = getMonthlyUsage(feature);
    return usage < limit;
  }
  return true;
}

export function getAllowedBoardIds() {
  if (!isEnabled('PREMIUM_ENABLED')) return null; // null = no restriction
  if (isPremium()) return null;
  return FREE_BOARD_IDS;
}

// ── Usage tracking ───────────────────────────────────────────────

function getUsageKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthlyUsage(feature) {
  try {
    const raw = localStorage.getItem('looper_usage');
    const usage = raw ? JSON.parse(raw) : {};
    return usage[feature]?.[getUsageKey()] || 0;
  } catch { return 0; }
}

export function incrementUsage(feature) {
  try {
    const raw = localStorage.getItem('looper_usage');
    const usage = raw ? JSON.parse(raw) : {};
    if (!usage[feature]) usage[feature] = {};
    const key = getUsageKey();
    usage[feature][key] = (usage[feature][key] || 0) + 1;
    localStorage.setItem('looper_usage', JSON.stringify(usage));
  } catch { /* quota */ }
}

// ── Upgrade prompt ───────────────────────────────────────────────

export function showUpgradePrompt(feature) {
  if (!isEnabled('PREMIUM_ENABLED')) return;

  const titles = {
    ai_reviews: 'AI Round Reviews',
    practice_sessions: 'Practice Sessions',
    league_boards: 'All League Boards',
    competitions: 'Competitions',
    stats_analysis: 'Stats Analysis',
  };

  const existing = document.getElementById('upgrade-prompt-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'upgrade-prompt-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6)';
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));width:100%;max-width:420px">
      <div style="font-size:17px;font-weight:700;color:var(--cream);margin-bottom:6px">Unlock ${titles[feature] || feature}</div>
      <div style="font-size:13px;color:var(--dim);line-height:1.6;margin-bottom:20px">
        You've used your free ${titles[feature]?.toLowerCase() || feature} for this month. Upgrade to Looper Premium for unlimited access.
      </div>
      <button class="btn" style="width:100%;border-radius:40px;padding:14px;font-size:15px" id="upgrade-cta">Upgrade to Premium</button>
      <button style="display:block;width:100%;margin-top:10px;padding:10px;background:none;border:none;color:var(--dim);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif" id="upgrade-dismiss">Maybe later</button>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('upgrade-dismiss')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  document.getElementById('upgrade-cta')?.addEventListener('click', () => {
    // Native bridge: window.LooperNative?.purchase('com.looper.premium.monthly')
    // Web fallback: show app store links
    if (window.LooperNative?.purchase) {
      window.LooperNative.purchase('com.looper.premium.monthly');
    } else {
      modal.querySelector('.btn').textContent = 'Available in the Looper app';
      modal.querySelector('.btn').disabled = true;
    }
  });
}
