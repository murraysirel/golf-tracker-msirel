// ─────────────────────────────────────────────────────────────────
// HAPTICS — native tactile feedback (no-op on web)
// ─────────────────────────────────────────────────────────────────
import { IS_NATIVE } from './config.js';

let Haptics = null;
let ImpactStyle = null;
let NotificationType = null;

if (IS_NATIVE) {
  import('@capacitor/haptics').then(mod => {
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
    NotificationType = mod.NotificationType;
  }).catch(() => {});
}

// Light tap — score adjusters, toggles, pill selections
export function tapLight() {
  Haptics?.impact({ style: ImpactStyle?.Light });
}

// Medium tap — hole navigation, player selection
export function tapMedium() {
  Haptics?.impact({ style: ImpactStyle?.Medium });
}

// Heavy tap — round save, finish round
export function tapHeavy() {
  Haptics?.impact({ style: ImpactStyle?.Heavy });
}

// Success — round saved, AI parse complete
export function notifySuccess() {
  Haptics?.notification({ type: NotificationType?.Success });
}

// Warning — validation nudge
export function notifyWarning() {
  Haptics?.notification({ type: NotificationType?.Warning });
}
