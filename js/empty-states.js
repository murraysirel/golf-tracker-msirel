// ─────────────────────────────────────────────────────────────────
// EMPTY STATES
// Reusable empty-state renderer for pages with no data yet.
// ─────────────────────────────────────────────────────────────────

const ICON_SVGS = {
  flag: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v14"/><path d="M4 2l9 3.5L4 9"/></svg>',
  trophy: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h8v5a4 4 0 0 1-8 0V2z"/><path d="M5 4H3.5a2 2 0 0 0 0 4H5"/><path d="M13 4h1.5a2 2 0 0 1 0 4H13"/><path d="M9 11v3"/><path d="M6 16h6"/></svg>',
  target: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><circle cx="9" cy="9" r="4"/><circle cx="9" cy="9" r="1"/></svg>',
  people: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16v-1.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3V16"/><circle cx="7" cy="5.5" r="3"/><path d="M16 16v-1.5a3 3 0 0 0-2.2-2.9"/><path d="M12 2.6a3 3 0 0 1 0 5.8"/></svg>',
};

export function emptyState(icon, headline, subline, ctaText, ctaAction) {
  const svg = ICON_SVGS[icon] || icon;
  return `
    <div class="empty-state">
      <div class="empty-icon">${svg}</div>
      <div class="empty-headline">${headline}</div>
      <div class="empty-sub">${subline}</div>
      <button class="btn" onclick="${ctaAction}">${ctaText}</button>
    </div>
  `;
}
