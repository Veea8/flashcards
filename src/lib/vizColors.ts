/**
 * Chart colors, per mode. Every set below was checked with the dataviz
 * validator against the surfaces this app actually renders on
 * (light #fcfcfb, dark #1a1a19):
 *
 *   recall pair   light [#2a78d6,#d03b3b] · dark [#3987e5,#e66767]  — all checks PASS
 *   card states   light 4 slots PASS (contrast WARN on aqua/yellow → relieved by
 *                 the always-present legend with visible counts) · dark 4 slots PASS
 *   heatmap       single-hue blue ramp, monotone light→dark
 *
 * Re-run the validator if any value here changes.
 */
import { useEffect, useState } from 'react';

export interface VizPalette {
  surface: string;
  grid: string;
  axis: string;
  muted: string;
  /** Reviews chart: recalled (Good/Easy) vs struggled (Again/Hard). */
  recalled: string;
  struggled: string;
  /** Card state mix, in New / Learning / Review / Relearning order. */
  states: [string, string, string, string];
  /** Single-series bars (upcoming workload). */
  single: string;
  /** Heatmap: index 0 is "no reviews", then increasing magnitude. */
  heat: [string, string, string, string, string];
}

const LIGHT: VizPalette = {
  surface: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  recalled: '#2a78d6',
  struggled: '#d03b3b',
  states: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  single: '#2a78d6',
  heat: ['#e1e0d9', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'],
};

const DARK: VizPalette = {
  surface: '#1a1a19',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  recalled: '#3987e5',
  struggled: '#e66767',
  states: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  single: '#3987e5',
  heat: ['#2c2c2a', '#184f95', '#256abf', '#6da7ec', '#9ec5f4'],
};

/** Tracks the OS colour scheme so charts get their own dark steps, not a flip. */
export function useVizPalette(): VizPalette {
  const query = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [dark, setDark] = useState(query);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return dark ? DARK : LIGHT;
}
