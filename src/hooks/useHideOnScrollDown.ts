import { useEffect, useState, useRef } from 'react';

/**
 * ComboWise system navbar visibility:
 * - Visible only near the top of the page
 * - Hides after scrolling down past topReveal
 * - Does NOT reappear on mid-page scroll-up (only when back at top)
 *
 * Stabilized against sticky-header shake near document bottom
 * (navbar height change → scroll clamp → thrash).
 */
export function useHideOnScrollDown(options?: {
  /** Min downward delta (px) to hide once past top */
  hideThreshold?: number;
  /** Always show when scrollY is at or below this (px) */
  topReveal?: number;
  /** Do not change state when this close to document end (px) */
  bottomFreeze?: number;
  /** Ignore scroll events this long after a toggle (ms) */
  cooldownMs?: number;
}) {
  const hideThreshold = options?.hideThreshold ?? 10;
  const topReveal = options?.topReveal ?? 40;
  const bottomFreeze = options?.bottomFreeze ?? 160;
  const cooldownMs = options?.cooldownMs ?? 320;

  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  const cooldownUntil = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY || 0;
    hiddenRef.current = hidden;

    const applyHidden = (next: boolean) => {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setHidden(next);
      cooldownUntil.current = performance.now() + cooldownMs;
      window.requestAnimationFrame(() => {
        lastY.current = window.scrollY || 0;
        window.setTimeout(() => {
          lastY.current = window.scrollY || 0;
        }, cooldownMs);
      });
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      window.requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY || 0);
        const now = performance.now();

        if (now < cooldownUntil.current) {
          lastY.current = y;
          ticking.current = false;
          return;
        }

        const doc = document.documentElement;
        const distanceFromBottom =
          doc.scrollHeight - (y + (window.innerHeight || doc.clientHeight));

        // Near end of page: freeze (avoid sticky shake from height changes)
        if (distanceFromBottom <= bottomFreeze && y > topReveal) {
          lastY.current = y;
          ticking.current = false;
          return;
        }

        // Only reveal at page top — never on mid-page scroll-up
        if (y <= topReveal) {
          applyHidden(false);
        } else {
          const delta = y - lastY.current;
          // Hide once user scrolls down past the top zone
          if (!hiddenRef.current && delta > hideThreshold) {
            applyHidden(true);
          } else if (!hiddenRef.current && y > topReveal + 24) {
            // Absolute position past top (e.g. jump / restore) — hide without needing delta
            applyHidden(true);
          }
          // Mid-page scroll-up: keep hidden (no applyHidden(false))
        }

        lastY.current = y;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hideThreshold, topReveal, bottomFreeze, cooldownMs]);

  return hidden;
}
