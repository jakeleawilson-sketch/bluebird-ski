// One WebSocket per tab to the trip room: chat messages + live board events.
import { useEffect, useRef, useState } from 'preact/hooks';

export type ChatMessage = {
  id: string; member_id: string | null; name: string | null; body: string; kind: 'user' | 'system' | 'deal_share';
  deal_id: string | null; deal: Record<string, string | number | null> | null; created_at: string; edited_at: string | null; deleted_at: string | null;
};

export type BoardEvent = { event: 'trip' | 'deals' | 'upvote'; deal_id?: string; upvotes?: number };

export function useTripSocket(onEvent: (e: BoardEvent) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [olderDone, setOlderDone] = useState(false);
  const [lastError, setLastError] = useState('');
  const ws = useRef<WebSocket | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: number | undefined;
    let ping: number | undefined;

    const connect = () => {
      const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chat`);
      ws.current = s;
      s.onopen = () => {
        retry = 0;
        setConnected(true);
        ping = window.setInterval(() => s.readyState === 1 && s.send('{"type":"ping"}'), 45_000);
      };
      s.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'history') { setMessages(m.messages); setOlderDone(m.messages.length < 100); }
        else if (m.type === 'older') { setMessages((xs) => [...m.messages, ...xs]); setOlderDone(m.done); }
        else if (m.type === 'message') setMessages((xs) => [...xs, m.message]);
        else if (m.type === 'update') setMessages((xs) => xs.map((x) => (x.id === m.message.id ? m.message : x)));
        else if (m.type === 'event') eventRef.current(m);
        else if (m.type === 'error') { setLastError(m.error); setTimeout(() => setLastError(''), 4000); }
      };
      s.onclose = () => {
        setConnected(false);
        clearInterval(ping);
        if (!stopped) timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    const onVisible = () => { if (document.visibilityState === 'visible' && ws.current?.readyState === 3) { clearTimeout(timer); connect(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVisible);
      ws.current?.close();
    };
  }, []);

  const send = (payload: Record<string, unknown>) => {
    if (ws.current?.readyState === 1) { ws.current.send(JSON.stringify(payload)); return true; }
    return false;
  };

  return {
    messages, connected, olderDone, lastError,
    say: (body: string) => send({ type: 'send', body }),
    edit: (id: string, body: string) => send({ type: 'edit', id, body }),
    remove: (id: string) => send({ type: 'delete', id }),
    loadOlder: () => messages[0] && send({ type: 'older', before: messages[0].created_at }),
  };
}

export type TripSocket = ReturnType<typeof useTripSocket>;
