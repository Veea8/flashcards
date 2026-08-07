import { useCallback, useState, type ReactNode } from 'react';
import type { TooltipState } from './ChartTooltip';

/**
 * Chart hover that also works on touch. Pointer events cover mouse, pen and
 * finger uniformly; the difference is when to dismiss. A mouse leaving a mark
 * means "done", but a finger lifting does not — on touch the tooltip stays put
 * until another mark is tapped or the chart is left, otherwise it would flash
 * and vanish before it could be read.
 */
export function useChartTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);

  const show = useCallback((x: number, y: number, content: ReactNode) => {
    // Keep the bubble inside the plot; a mark at the far edge would otherwise
    // push it off-screen, which is most obvious on a narrow phone.
    setTip({ x: Math.min(92, Math.max(8, x)), y, content });
  }, []);

  const hide = useCallback((e?: { pointerType?: string }) => {
    if (e && e.pointerType && e.pointerType !== 'mouse') return;
    setTip(null);
  }, []);

  const clear = useCallback(() => setTip(null), []);

  /** Spread onto each mark's hit target. */
  const markProps = useCallback(
    (x: number, y: number, content: ReactNode) => ({
      onPointerEnter: () => show(x, y, content),
      onPointerDown: () => show(x, y, content),
      onPointerLeave: (e: { pointerType?: string }) => hide(e),
    }),
    [show, hide],
  );

  return { tip, markProps, clear };
}
