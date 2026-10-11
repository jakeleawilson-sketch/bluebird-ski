import { avatarColour, initials, type Band } from '../api';

export function Avatar({ id, name, online }: { id: string; name: string; online?: boolean }) {
  return (
    <span class={'avatar' + (online ? ' online' : '')} style={{ background: avatarColour(id) }} title={name + (online ? ' (online)' : '')} aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function Piste({ band }: { band: Pick<Band, 'piste' | 'label'> }) {
  return <span class={`piste piste-${band.piste}`} role="img" aria-label={band.label} />;
}

export function ScoreRing({ value, label = 'Bluebird score' }: { value: number; label?: string }) {
  return (
    <div class="score" style={{ '--v': value } as Record<string, number>} role="img" aria-label={`${label} ${value} out of 100`} title={label}>
      <b>{value}</b>
    </div>
  );
}

export function Confetti() {
  const colours = ['#f5a524', '#ff7a1a', '#1446c4', '#5b8fe8', '#1f9d55', '#ffffff'];
  return (
    <div class="confetti" aria-hidden="true">
      {Array.from({ length: 70 }, (_, i) => (
        <i style={{ left: `${(i * 37) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 14) * 0.08}s`, transform: `rotate(${i * 23}deg)` }} />
      ))}
    </div>
  );
}

/** Minimal SVG sparkline for price history. */
export function Sparkline({ points }: { points: { price_pp_gbp: number; captured_at: string }[] }) {
  if (points.length < 2) return <p class="muted small">Price history builds up as Bluebird re-checks this deal.</p>;
  const w = 300, h = 80, pad = 6;
  const xs = points.map((p) => Date.parse(p.captured_at));
  const ys = points.map((p) => p.price_pp_gbp);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * pad);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(p.price_pp_gbp).toFixed(1)}`).join(' ');
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Price went from £${ys[0]} to £${ys[ys.length - 1]}`}>
      <path class="area" d={`${line} L${sx(x1)} ${h} L${sx(x0)} ${h}Z`} />
      <path class="line" d={line} />
    </svg>
  );
}
