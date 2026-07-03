import { ProgressBar } from '@/components/game/progress-bar';

function moraleColor(pct: number): string {
  if (pct < 30) return '#ef4444';
  if (pct < 60) return '#f59e0b';
  return '#22c55e';
}

export function MoraleBar({ morale }: { morale: number }) {
  return <ProgressBar percent={morale} color={moraleColor(morale)} />;
}
