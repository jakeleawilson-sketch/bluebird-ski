// The trip's single chat room (HANDOFF section 10). One instance ("trip").
// WebSockets use the hibernation API. Messages live in this object's SQLite
// and are mirrored to D1 for export. The same sockets carry live board events
// (new deal, upvotes, week locked) so the dashboard updates without polling.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export type ChatKind = 'user' | 'system' | 'deal_share';

export type ChatMessage = {
  id: string;
  member_id: string | null;
  name: string | null;
  body: string;
  kind: ChatKind;
  deal_id: string | null;
  deal: DealCard | null; // compact card snapshot for deal shares
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type DealCard = Record<string, string | number | null>;

type Attachment = { id: string; name: string; admin: boolean };

const MAX_LEN = 2000;
const EDIT_WINDOW_MS = 10 * 60_000;
const RATE = { count: 8, windowMs: 20_000 };
const PAGE = 100;

export class ChatRoom extends DurableObject<Env> {
  sql: SqlStorage;
  recent = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, member_id TEXT, name TEXT, body TEXT NOT NULL, kind TEXT NOT NULL,
      deal_id TEXT, deal TEXT, created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS messages_created ON messages(created_at)');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const att: Attachment = {
      id: request.headers.get('X-Member-Id')!,
      name: request.headers.get('X-Member-Name')!,
      admin: request.headers.get('X-Is-Admin') === '1',
    };
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [att.id]);
    pair[1].serializeAttachment(att);
    pair[1].send(JSON.stringify({ type: 'history', messages: this.page(), done: false }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const me = ws.deserializeAttachment() as Attachment;
    let msg: { type: string; id?: string; body?: string; before?: string };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const err = (error: string) => ws.send(JSON.stringify({ type: 'error', error }));

    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

    if (msg.type === 'older') {
      const messages = this.page(msg.before);
      return ws.send(JSON.stringify({ type: 'older', messages, done: messages.length < PAGE }));
    }

    if (msg.type === 'send') {
      const body = (msg.body ?? '').trim();
      if (!body) return;
      if (body.length > MAX_LEN) return err(`Messages are limited to ${MAX_LEN} characters.`);
      if (!this.allow(me.id)) return err('Slow down a little!');
      await this.add({ member_id: me.id, name: me.name, body, kind: 'user', deal_id: null, deal: null });
      return;
    }

    const target = msg.id ? this.get(msg.id) : null;
    if (!target || target.deleted_at) return;
    const own = target.member_id === me.id;
    const fresh = Date.now() - Date.parse(target.created_at) < EDIT_WINDOW_MS;

    if (msg.type === 'edit') {
      const body = (msg.body ?? '').trim();
      if (!own || !fresh || target.kind !== 'user') return err('You can only edit your own messages for 10 minutes.');
      if (!body || body.length > MAX_LEN) return;
      const now = new Date().toISOString();
      this.sql.exec('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', body, now, target.id);
      this.mirror('UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?', body, now, target.id);
      this.broadcast({ type: 'update', message: this.get(target.id) });
    }

    if (msg.type === 'delete') {
      if (!me.admin && !(own && fresh)) return err('You can only delete your own messages for 10 minutes.');
      const now = new Date().toISOString();
      this.sql.exec("UPDATE messages SET body = '', deleted_at = ? WHERE id = ?", now, target.id);
      this.mirror("UPDATE chat_messages SET body = '', deleted_at = ? WHERE id = ?", now, target.id);
      this.broadcast({ type: 'update', message: this.get(target.id) });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, 'bye'); } catch { /* already closed */ }
  }

  // ---------------------------------------------------------------- RPC from the Worker

  /** Post a system message or a deal share. */
  async post(m: { kind: ChatKind; body: string; member_id?: string | null; name?: string | null; deal_id?: string | null; deal?: DealCard | null }) {
    return this.add({ member_id: m.member_id ?? null, name: m.name ?? null, body: m.body.slice(0, MAX_LEN), kind: m.kind, deal_id: m.deal_id ?? null, deal: m.deal ?? null });
  }

  /** Broadcast a non-chat board event to everyone connected. */
  async event(payload: Record<string, unknown>) {
    this.broadcast({ type: 'event', ...payload });
  }

  online(): string[] {
    return [...new Set(this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id))];
  }

  // ---------------------------------------------------------------- internals

  private async add(m: Omit<ChatMessage, 'id' | 'created_at' | 'edited_at' | 'deleted_at'>) {
    const msg: ChatMessage = { ...m, id: crypto.randomUUID(), created_at: new Date().toISOString(), edited_at: null, deleted_at: null };
    this.sql.exec('INSERT INTO messages (id, member_id, name, body, kind, deal_id, deal, created_at) VALUES (?,?,?,?,?,?,?,?)',
      msg.id, msg.member_id, msg.name, msg.body, msg.kind, msg.deal_id, msg.deal ? JSON.stringify(msg.deal) : null, msg.created_at);
    this.mirror('INSERT INTO chat_messages (id, member_id, body, kind, deal_id, created_at) VALUES (?,?,?,?,?,?)',
      msg.id, msg.member_id, msg.body, msg.kind, msg.deal_id, msg.created_at);
    this.broadcast({ type: 'message', message: msg });
    return msg;
  }

  private page(before?: string): ChatMessage[] {
    const rows = before
      ? this.sql.exec('SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?', before, PAGE).toArray()
      : this.sql.exec('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', PAGE).toArray();
    return rows.reverse().map(rowToMessage);
  }

  private get(id: string): ChatMessage | null {
    const r = this.sql.exec('SELECT * FROM messages WHERE id = ?', id).toArray()[0];
    return r ? rowToMessage(r) : null;
  }

  private broadcast(payload: unknown) {
    const s = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(s); } catch { /* socket gone */ }
    }
  }

  private mirror(sql: string, ...args: unknown[]) {
    this.ctx.waitUntil(this.env.DB.prepare(sql).bind(...args).run().catch((e) => console.error('chat mirror', e)));
  }

  private allow(memberId: string): boolean {
    const now = Date.now();
    const times = (this.recent.get(memberId) ?? []).filter((t) => now - t < RATE.windowMs);
    if (times.length >= RATE.count) return false;
    times.push(now);
    this.recent.set(memberId, times);
    return true;
  }
}

function rowToMessage(r: Record<string, SqlStorageValue>): ChatMessage {
  return {
    id: r.id as string,
    member_id: (r.member_id as string) ?? null,
    name: (r.name as string) ?? null,
    body: r.body as string,
    kind: r.kind as ChatKind,
    deal_id: (r.deal_id as string) ?? null,
    deal: r.deal ? JSON.parse(r.deal as string) : null,
    created_at: r.created_at as string,
    edited_at: (r.edited_at as string) ?? null,
    deleted_at: (r.deleted_at as string) ?? null,
  };
}
