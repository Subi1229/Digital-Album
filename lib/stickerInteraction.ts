/**
 * Shared state for sticker ↔ ImageSlot coordination on mobile/tablet.
 *
 * Root cause: On touch devices, when a sticker receives a pointerdown the
 * browser later synthesises a ghost "click" event (~300 ms after touchend).
 * If the sticker has been removed or replaced by PeelAnimation at that point,
 * the ghost click falls through to the underlying ImageSlot and opens the
 * file picker unexpectedly.
 *
 * Fix: sticker calls markStickerPress() on every pointerdown.
 * ImageSlot checks isStickerRecentlyPressed() in its onClick guard and
 * silently swallows the event if the flag is fresh.
 *
 * Desktop is unaffected — ghost clicks do not occur with real mouse events.
 */

const SUPPRESS_MS = 500; // covers 300 ms ghost-click delay + small margin
let _lastPressAt = 0;

/** Call on every sticker pointerdown (mobile + desktop, harmless on desktop). */
export function markStickerPress(): void {
  _lastPressAt = Date.now();
}

/** Returns true within SUPPRESS_MS of the last sticker press. */
export function isStickerRecentlyPressed(): boolean {
  return Date.now() - _lastPressAt < SUPPRESS_MS;
}

// ── Corner-tap suppression ────────────────────────────────────────────────────
// Problem: on mobile the bottom corners of the page (used to flip pages)
// physically overlap with image slots in the photo grid.  When a corner tap
// fires goPrev/goNext, the slot's onClick also fires and opens the file picker.
// Fix: AlbumBook marks a corner tap; ImageSlot suppresses its own onClick.

let _lastCornerTapAt = 0;

/** Call when a corner tap is detected on mobile (before goPrev/goNext). */
export function markCornerTap(): void {
  _lastCornerTapAt = Date.now();
}

/** True within 600 ms of a corner tap — ImageSlot should suppress onClick. */
export function wasCornerTapRecent(): boolean {
  return Date.now() - _lastCornerTapAt < 600;
}
