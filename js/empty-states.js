// ─────────────────────────────────────────────────────────────────
// EMPTY STATES
// Reusable empty-state renderer for pages with no data yet.
// ─────────────────────────────────────────────────────────────────

export function emptyState(icon, headline, subline, ctaText, ctaAction) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-headline">${headline}</div>
      <div class="empty-sub">${subline}</div>
      <button class="btn" onclick="${ctaAction}">${ctaText}</button>
    </div>
  `;
}
