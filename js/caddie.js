// ─────────────────────────────────────────────────────────────────
// CADDIE BUTTON
// Handles the draggable floating pill button that returns the user
// to the unified live screen (#pg-live) during an active round.
// The GPS+scoring overlay has been merged into #pg-live (live.js).
// ─────────────────────────────────────────────────────────────────

// ── Draggable Caddie button ───────────────────────────────────────

export function initCaddieButton() {
  const btn = document.getElementById('caddie-btn');
  if (!btn) return;

  let dragging = false;
  let justDragged = false;
  let startX, startY, btnX, btnY;

  // Suppress the click that fires right after a drag release
  btn.addEventListener('click', e => {
    if (justDragged) { justDragged = false; e.stopImmediatePropagation(); }
  }, true);

  btn.addEventListener('pointerdown', e => {
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    btnX = rect.left + rect.width / 2;
    btnY = rect.top + rect.height / 2;
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', e => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging = true;
    if (!dragging) return;

    const newX = btnX + dx;
    const newY = btnY + dy;
    const hw = btn.offsetWidth / 2;
    const hh = btn.offsetHeight / 2;
    const clampedX = Math.max(hw, Math.min(window.innerWidth - hw, newX));
    const clampedY = Math.max(hh, Math.min(window.innerHeight - hh, newY));

    btn.style.left = clampedX + 'px';
    btn.style.top = clampedY + 'px';
    btn.style.transform = 'none';
    btn.style.bottom = 'auto';
    btn.style.right = 'auto';
  });

  btn.addEventListener('pointerup', () => {
    if (dragging) {
      dragging = false;
      justDragged = true;
    }
  });
}
