import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type RankOption = { id: string; label: ComponentChildren; sub?: ComponentChildren; text: string };

/**
 * Pick-and-rank list. Tap a chip to add it to the ranking; drag the grip (or
 * use the arrow buttons, which also work with a keyboard) to reorder.
 */
export function RankList({ options, value, onChange, max, emptyHint }: {
  options: RankOption[];
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  emptyHint?: string;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const ranked = value.filter((id) => byId.has(id));
  const rest = options.filter((o) => !ranked.includes(o.id));
  const listRef = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ranked.length || from === to) return;
    const next = [...ranked];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
    setAnnounce(`${byId.get(x)!.text} moved to position ${to + 1}`);
  };

  const startDrag = (e: PointerEvent, id: string) => {
    e.preventDefault();
    const list = listRef.current!;
    setDragging(id);
    const onMove = (ev: PointerEvent) => {
      const items = [...list.children] as HTMLElement[];
      const from = items.findIndex((el) => el.dataset.id === id);
      let to = items.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (to === -1) to = items.length - 1;
      else if (to > from) to -= 1;
      if (from !== -1 && to !== from) {
        const ids = items.map((el) => el.dataset.id!);
        const [x] = ids.splice(from, 1);
        ids.splice(to, 0, x);
        onChange(ids);
      }
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const full = max != null && ranked.length >= max;

  return (
    <div>
      {ranked.length > 0 ? (
        <ol class="ranklist" ref={listRef}>
          {ranked.map((id, i) => {
            const o = byId.get(id)!;
            return (
              <li key={id} data-id={id} class={dragging === id ? 'dragging' : ''}>
                <button type="button" class="grip" aria-label={`Drag to reorder ${o.text}`} onPointerDown={(e) => startDrag(e as PointerEvent, id)}>⋮⋮</button>
                <span class="rank-badge" aria-hidden="true">{i + 1}</span>
                <span class="label">
                  {o.label}
                  {o.sub && <div class="tiny muted">{o.sub}</div>}
                </span>
                <button type="button" class="iconbtn" aria-label={`Move ${o.text} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                <button type="button" class="iconbtn" aria-label={`Move ${o.text} down`} disabled={i === ranked.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                <button type="button" class="iconbtn" aria-label={`Remove ${o.text}`} onClick={() => onChange(ranked.filter((x) => x !== id))}>×</button>
              </li>
            );
          })}
        </ol>
      ) : (
        emptyHint && <p class="muted small">{emptyHint}</p>
      )}
      {rest.length > 0 && (
        <div class="unranked" aria-label="Not yet picked">
          {rest.map((o) => (
            <button type="button" class="chip" disabled={full} onClick={() => onChange([...ranked, o.id])}>
              + {o.label}
            </button>
          ))}
        </div>
      )}
      {full && <p class="tiny muted" style={{ marginTop: 8 }}>That's the maximum of {max}. Remove one to swap.</p>}
      <div class="sr-only" aria-live="polite">{announce}</div>
    </div>
  );
}
