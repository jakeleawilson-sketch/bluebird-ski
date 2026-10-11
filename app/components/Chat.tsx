import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { avatarColour, fmtDate, gbp, initials } from '../api';
import type { ChatMessage, TripSocket } from '../socket';

const EDIT_WINDOW_MS = 10 * 60_000;

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return parts.map((p, i) => (i % 2 ? <a href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p));
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function Chat({ sock, me, isAdmin, onOpenDeal, title = 'Group chat' }: {
  sock: TripSocket; me: string; isAdmin: boolean; onOpenDeal: (id: string) => void; title?: string;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevFirst = useRef<string | null>(null);
  const prevHeight = useRef(0);

  // Keep pinned to the bottom for new messages; keep position when older ones load.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const first = sock.messages[0]?.id ?? null;
    if (prevFirst.current && first !== prevFirst.current && prevHeight.current) el.scrollTop += el.scrollHeight - prevHeight.current;
    else if (stick.current) el.scrollTop = el.scrollHeight;
    prevFirst.current = first;
    prevHeight.current = el.scrollHeight;
  }, [sock.messages]);

  const onScroll = () => {
    const el = box.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 40 && !sock.olderDone) { prevHeight.current = el.scrollHeight; sock.loadOlder(); }
  };

  useEffect(() => { if (editing) setText(editing.body); }, [editing]);

  const submit = (e: Event) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const ok = editing ? sock.edit(editing.id, body) : sock.say(body);
    if (ok) { setText(''); setEditing(null); stick.current = true; }
  };

  let lastDay = '';
  return (
    <section class="card chat" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span class="spacer" />
        <span class="tiny muted">{sock.connected ? '● live' : 'reconnecting…'}</span>
      </header>
      <div class="msgs" ref={box} onScroll={onScroll} role="log" aria-live="polite">
        {!sock.messages.length && <p class="muted small" style={{ textAlign: 'center', marginTop: 20 }}>No messages yet. Say hello 👋</p>}
        {sock.messages.map((m) => {
          const day = m.created_at.slice(0, 10);
          const divider = day !== lastDay ? <div class="sysmsg" style={{ background: 'none' }}>{fmtDate(m.created_at, { weekday: 'long', day: 'numeric', month: 'long' })}</div> : null;
          lastDay = day;
          if (m.kind === 'system') return <>{divider}<div class="sysmsg">{m.body}</div></>;
          const mine = m.member_id === me;
          const canEdit = mine && m.kind === 'user' && !m.deleted_at && Date.now() - Date.parse(m.created_at) < EDIT_WINDOW_MS;
          const canDelete = !m.deleted_at && (isAdmin || canEdit);
          return (
            <>
              {divider}
              <div class={'msg' + (mine ? ' me' : '')}>
                {!mine && <span class="avatar" style={{ background: avatarColour(m.member_id ?? ''), width: 28, height: 28, fontSize: '0.7rem' }} aria-hidden="true">{initials(m.name ?? '?')}</span>}
                <div>
                  <div class="bubble">
                    {!mine && <div class="who">{m.name}</div>}
                    {m.deleted_at ? <em class="muted">message deleted</em> : (
                      <>
                        {m.body && <span>{linkify(m.body)}</span>}
                        {m.kind === 'deal_share' && m.deal && (
                          <a class="share-card" href={`/deal/${m.deal.id}`} onClick={(e) => { e.preventDefault(); onOpenDeal(String(m.deal!.id)); }}>
                            <strong>{m.deal.accommodation_name}</strong>
                            <div class="small muted">{m.deal.resort_name_raw} · {m.deal.departure_airport} · {gbp(Number(m.deal.price_pp_gbp))}pp</div>
                          </a>
                        )}
                      </>
                    )}
                    <span class="when">{time(m.created_at)}{m.edited_at && !m.deleted_at ? ' · edited' : ''}</span>
                  </div>
                  {(canEdit || canDelete) && (
                    <div class="msg-tools" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      {canEdit && <button type="button" onClick={() => setEditing(m)}>Edit</button>}
                      {canDelete && <button type="button" onClick={() => confirm('Delete this message?') && sock.remove(m.id)}>Delete</button>}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })}
      </div>
      {sock.lastError && <p class="error small" style={{ padding: '0 14px' }} role="alert">{sock.lastError}</p>}
      <form onSubmit={submit}>
        {editing && <button type="button" class="btn btn-sm btn-ghost" onClick={() => { setEditing(null); setText(''); }}>Cancel</button>}
        <label class="sr-only" for="chat-input">Message</label>
        <input id="chat-input" class="input" maxLength={2000} placeholder={editing ? 'Edit message…' : 'Message the group…'} value={text} onInput={(e) => setText(e.currentTarget.value)} autocomplete="off" />
        <button class="btn btn-sky" type="submit" disabled={!text.trim() || !sock.connected}>{editing ? 'Save' : 'Send'}</button>
      </form>
    </section>
  );
}
