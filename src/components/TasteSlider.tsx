/**
 * TasteSlider — one slider row in the For You taste-fingerprint card.
 *
 * Read-only when `editable=false` (the resting state); a draggable
 * track when the card is unlocked. Extracted from ForYouPage so the
 * pointer-lifecycle logic lives in one focused unit.
 *
 * Event split:
 *  - `onDragStart` — pointer down. The parent cancels its auto-relock
 *    timer so it can't fire mid-drag.
 *  - `onChange`    — every drag tick. Cheap visual draft update only.
 *  - `onCommit`    — pointer release. The parent re-ranks + re-arms the
 *    relock timer. The committed value is read from the pointer
 *    geometry at release, NOT a render-written ref, so React batching
 *    of the final move can't commit a stale position.
 */

import { useEffect, useRef } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Quartile zone for a 0..1 slider value. A zone change during a drag
 * fires a light haptic — the port of the threshold-crossing feedback
 * the old SliderTray bottom-sheet had (parking-lot IN-401). The old
 * implementation keyed off the value→label boundaries (incl. a per-key
 * "Balanced" deadzone); the quartile split keeps the same on-drag
 * tactile cadence without the SLIDER_CONFIG dependency.
 */
export function sliderZone(v: number): 0 | 1 | 2 | 3 {
  if (v < 0.25) return 0;
  if (v < 0.5) return 1;
  if (v < 0.75) return 2;
  return 3;
}

export interface TasteSliderProps {
  value: number;
  editable: boolean;
  /** Pointer down — parent cancels the auto-relock timer. */
  onDragStart: () => void;
  /** Drag tick — draft-only visual update. */
  onChange: (v: number) => void;
  /** Pointer release — parent commits + re-arms the relock timer. */
  onCommit: (v: number) => void;
  left: string;
  right: string;
  label: string;
}

export function TasteSlider({
  value,
  editable,
  onDragStart,
  onChange,
  onCommit,
  left,
  right,
  label,
}: TasteSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // Zone the thumb was last in, for threshold-crossing haptics.
  const prevZoneRef = useRef<number>(sliderZone(value));

  // If the card relocks (editable → false) while a drag is somehow
  // still open — auto-relock timer, parent re-render, OS dropping the
  // pointer without a cancel event on Android WebView during the
  // 24px→2px height change — clear the drag flag so a stray later
  // pointer event can't emit a phantom change.
  useEffect(() => {
    if (!editable) draggingRef.current = false;
  }, [editable]);

  const valueFromEvent = (clientX: number): number => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  // Visual update + a light haptic when the value crosses a quartile
  // boundary, mirroring the old bottom-sheet feel.
  const emitChange = (next: number) => {
    const zone = sliderZone(next);
    if (zone !== prevZoneRef.current) {
      prevZoneRef.current = zone;
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => { /* web / no haptics */ });
    }
    onChange(next);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    draggingRef.current = true;
    prevZoneRef.current = sliderZone(value);
    // Capture on the element that carries the listeners (the hit-area
    // div), not e.target — that can be the thumb or track child, and
    // releasing capture on a node that re-rendered mid-drag is flaky.
    e.currentTarget.setPointerCapture(e.pointerId);
    onDragStart();
    emitChange(valueFromEvent(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !editable) return;
    emitChange(valueFromEvent(e.clientX));
  };

  // pointerup AND pointercancel both land here: a cancel (palm
  // rejection, OS interrupt) commits the last position rather than
  // discarding it. A taste slider has no destructive outcome and the
  // user can always re-drag, so commit-on-cancel is the less surprising
  // behaviour. Commit the value from the release geometry — not a
  // render-written ref — so the final move can't be one batch stale.
  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    onCommit(valueFromEvent(e.clientX));
  };

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div
        className="flex items-center justify-between gap-2"
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-faint)',
        }}
      >
        <span className="truncate">{left}</span>
        <span className="truncate">{right}</span>
      </div>
      {/* Hit-area wraps the visible track. When editable we expand the
          touch target to 24px tall so the 2px line is easy to grab; the
          line itself stays thin via the inner element. `touch-action:
          none` prevents the page from picking the gesture up as a
          vertical scroll. */}
      <div
        ref={trackRef}
        className="relative w-full"
        style={{
          height: editable ? 24 : 2,
          marginTop: editable ? -5 : 6,
          marginBottom: editable ? -5 : 0,
          touchAction: editable ? 'none' : 'auto',
          cursor: editable ? 'pointer' : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          className="absolute left-0 right-0"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            height: 2,
            background: 'var(--surface-tint)',
            borderRadius: 'var(--r-pill)',
          }}
        />
        <span
          aria-hidden
          className="absolute"
          style={{
            left: `calc(${value * 100}% - 7px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: editable ? 16 : 14,
            height: editable ? 16 : 14,
            borderRadius: '50%',
            background: 'var(--primary)',
            boxShadow: editable
              ? '0 0 0 4px color-mix(in srgb, var(--primary) 25%, transparent), 0 1px 4px rgba(0,0,0,0.25)'
              : '0 1px 4px rgba(0,0,0,0.25)',
            transition: 'width 120ms var(--ease-out), height 120ms var(--ease-out), box-shadow 120ms var(--ease-out)',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--fg)',
          marginTop: 6,
        }}
      >
        {label}
      </span>
    </div>
  );
}
