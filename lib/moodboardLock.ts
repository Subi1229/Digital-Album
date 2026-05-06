/**
 * Cross-layer manipulation lock for moodboard elements.
 *
 * Problem: StickerLayer, MoodboardImageLayer, and MoodboardTextLayer each manage
 * their own `activeId` independently, so when an element in one layer is being
 * manipulated (pinch-resize, drag, rotate), elements in _other_ layers remain
 * interactive — causing accidental drags during resize/rotate gestures.
 *
 * Solution: A lightweight shared module that tracks whether ANY moodboard element
 * across all layers is currently being manipulated. Each layer checks this flag
 * to block pointer events on its elements when another layer owns the lock.
 *
 * This is deliberately NOT a React context — we need synchronous reads from native
 * touch event handlers (useEffect-registered listeners), and React context updates
 * require a render cycle which would be too slow for 60fps gesture handling.
 */

type LockListener = () => void;

let _lockedLayer: string | null = null;   // e.g. "sticker", "mbimage", "mbtext"
let _lockedId: string | null = null;      // element id within that layer
const _listeners = new Set<LockListener>();

/** Acquire the manipulation lock for a specific layer + element.
 *  Returns true if acquired (or already owned by same element), false if another element holds it. */
export function acquireLock(layer: string, elementId: string): boolean {
  if (_lockedLayer === null) {
    _lockedLayer = layer;
    _lockedId = elementId;
    _notify();
    return true;
  }
  // Same element re-acquiring (harmless)
  return _lockedLayer === layer && _lockedId === elementId;
}

/** Release the manipulation lock. Only the current holder can release. */
export function releaseLock(layer: string, elementId: string): void {
  if (_lockedLayer === layer && _lockedId === elementId) {
    _lockedLayer = null;
    _lockedId = null;
    _notify();
  }
}

/** Check if a different element currently holds the lock.
 *  Returns true when the caller should block pointer events on its elements. */
export function isLockedByOther(layer: string, elementId: string): boolean {
  if (_lockedLayer === null) return false;
  return !(_lockedLayer === layer && _lockedId === elementId);
}

/** Check if ANY manipulation is in progress (any layer, any element). */
export function isAnyLocked(): boolean {
  return _lockedLayer !== null;
}

/** Subscribe to lock state changes (for React re-renders). Returns unsubscribe fn. */
export function subscribeLock(listener: LockListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** Get a snapshot of the current lock state (for useSyncExternalStore). */
export function getLockSnapshot(): string | null {
  return _lockedLayer;
}

function _notify(): void {
  _listeners.forEach((fn) => fn());
}
