import { useEffect, useState } from 'preact/hooks';
import { ago, api, ApiError, fmtDate, gbp, type Me, type Standing, type Week } from '../api';
import { MemberNav } from './Nav';
import { Loading, SkyHeader } from './Sky';

type Source = {
  id: string; name: string; type: string; base_url: string; enabled: number; logging_enabled: number; research_note: string | null;
  last_run_at: string | null; last_status: string | null; last_error: string | null; runs_total: number; runs_ok: number; consecutive_failures: number; blocked: number;
};
type Run = { id: number; source_id: string; kind: string; started_at: string; finished_at: string | null; status: string | null; items: number; pages: number; error: string | null };
type AdminMember = {
  id: string; name: string; email: string; status: string; email_verified_at: string | null; last_seen_at: string | null; budget_ceiling_gbp: number | null;
  countries: string[]; accommodation: string[]; airports: string[]; weeks: string[]; last_minute: string | null; room_pref: string | null; notes: string | null; is_admin: number;
};
type Overview = {
  settings: {
    locked_week: string | null; vote_deadline: string | null; group_budget_override: number | null; registration_open: boolean; allow_sunday: boolean;
    alert_thresholds: { score: number; price_drop_pct: number; whatsapp_daily_cap: number; deal_of_the_day: boolean };
    score_weights: Record<string, number>; ai_monthly_cap_gbp: number;
  };
  invite_url: string;
  members: AdminMember[];
  leaderboard: Standing[];
  weeks: Week[];
  sources: Source[];
  runs: Run[];
  health: { ai: { usd: number; gbp: number; calls: number }; alerts: { channel: string; status: string; n: number }[]; snapshots: { rows: number; products: number; days: number; last: string | null }; email_configured: boolean };
};

export function AdminPage({ me }: { me: Me }) {
  const [o, setO] = useState<Overview | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => api<Overview>('/admin/overview').then(setO);
  useEffect(() => { load(); }, []);

  const act = async (path: string, body: unknown, note?: string) => {
    try {
      const r = await api<Record<string, unknown>>(path, { body });
      setMsg(note ?? (r.error ? String(r.error) : 'Done.'));
      await load();
      return r;
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Failed.');
    }
  };

  if (!o) return <><SkyHeader nav={<MemberNav me={me} />} /><Loading /></>;
  const s = o.settings;

  return (
    <>
      <SkyHeader nav={<MemberNav me={me} />}><h1 style={{ paddingBottom: 46 }}>Admin</h1></SkyHeader>
      <main class="page stack" style={{ marginTop: -30, position: 'relative' }}>
        {msg && <div class="notice" role="status" onClick={() => setMsg('')}>{msg}</div>}

        <section class="card stack">
          <h2>Invite</h2>
          <div class="row">
            <input class="input" readOnly value={o.invite_url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.currentTarget.select()} />
            <button class="btn btn-sun" onClick={() => navigator.clipboard.writeText(o.invite_url).then(() => setMsg('Invite link copied.'))}>Copy link</button>
          </div>
          <div class="row">
            <button class="btn btn-sm" onClick={() => confirm('Rotate the invite link? The old one stops working.') && act('/admin/invite/rotate', {}, 'New invite link created.')}>Rotate link</button>
            <label class="check small"><input type="checkbox" checked={s.registration_open} onChange={(e) => act('/admin/settings', { registration_open: e.currentTarget.checked })} /> Registration open</label>
          </div>
        </section>

        <section class="card stack">
          <h2>Week</h2>
          <p class="small muted">{s.locked_week ? `Locked: ${fmtDate(s.locked_week, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : 'Not locked yet.'}</p>
          <div class="row">
            <label class="field" style={{ flex: 1, minWidth: 220 }}><span>Voting deadline (auto-locks the top week)</span>
              <input class="input" type="datetime-local" value={s.vote_deadline ? toLocalInput(s.vote_deadline) : ''} onChange={(e) => act('/admin/settings', { vote_deadline: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null }, 'Deadline saved.')} />
            </label>
            <label class="check small"><input type="checkbox" checked={s.allow_sunday} onChange={(e) => act('/admin/settings', { allow_sunday: e.currentTarget.checked })} /> Allow Sunday departures</label>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Week</th><th>Can go</th><th>Pref.</th><th>Who</th><th /></tr></thead>
              <tbody>
                {o.leaderboard.map((w) => (
                  <tr>
                    <td><strong>{fmtDate(w.start, { day: 'numeric', month: 'short' })}</strong></td>
                    <td>{w.available}</td>
                    <td>{w.preference.toFixed(2)}</td>
                    <td class="small">{w.names.join(', ')}</td>
                    <td>{s.locked_week === w.start
                      ? <button class="btn btn-sm" onClick={() => act('/admin/lock', { week: null }, 'Unlocked.')}>Unlock</button>
                      : <button class="btn btn-sm btn-sun" onClick={() => confirm(`Lock ${w.start}? Everyone gets an email.`) && act('/admin/lock', { week: w.start }, 'Week locked.')}>Lock</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary class="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Show / hide candidate weeks</summary>
            <div class="row" style={{ marginTop: 10 }}>
              {o.weeks.map((w) => (
                <label class="check small" style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={!w.hidden} onChange={(e) => act(`/admin/weeks/${w.start_date}`, { hidden: !e.currentTarget.checked })} />
                  {w.label}{w.badge ? ` (${w.badge})` : ''}
                </label>
              ))}
            </div>
          </details>
        </section>

        <section class="card stack">
          <h2>Members ({o.members.length})</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Budget</th><th>Prefs</th><th>Verified</th><th>Last seen</th><th /></tr></thead>
              <tbody>
                {o.members.map((m) => (
                  <tr>
                    <td><strong>{m.name}</strong><div class="tiny muted">{m.email}</div></td>
                    <td>{m.status}{m.is_admin ? ' · admin' : ''}</td>
                    <td>{m.budget_ceiling_gbp ? (m.budget_ceiling_gbp >= 99999 ? 'No limit' : gbp(m.budget_ceiling_gbp)) : '–'}</td>
                    <td class="small">{m.countries.join(' ')} · {m.airports.join(' ')} · {m.weeks.length} wks · last-min {m.last_minute ?? '–'}{m.notes ? <div class="muted">“{m.notes}”</div> : null}</td>
                    <td>{m.email_verified_at ? '✓' : <span class="muted">pending</span>}</td>
                    <td class="small">{m.last_seen_at ? ago(m.last_seen_at) : '–'}</td>
                    <td>{!m.is_admin && <button class="btn btn-sm btn-danger" onClick={() => confirm(`Remove ${m.name}? This deletes their answers.`) && fetch(`/api/admin/members/${m.id}`, { method: 'DELETE' }).then(load)}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="row">
            <a class="btn btn-sm" href="/api/admin/export/members.csv" download>Export members CSV</a>
            <a class="btn btn-sm" href="/api/admin/export/deals.csv" download>Export deals CSV</a>
          </div>
        </section>

        <section class="card stack">
          <h2>Budget &amp; alerts</h2>
          <div class="row">
            <label class="field" style={{ flex: 1, minWidth: 180 }}><span>Group budget override (£pp, blank = lowest "in" member)</span>
              <input class="input" type="number" min={100} step={50} value={s.group_budget_override ?? ''} onChange={(e) => act('/admin/settings', { group_budget_override: e.currentTarget.value ? Number(e.currentTarget.value) : null }, 'Budget saved.')} />
            </label>
            <label class="field" style={{ width: 150 }}><span>Alert score ≥</span>
              <input class="input" type="number" value={s.alert_thresholds.score} onChange={(e) => act('/admin/settings', { alert_thresholds: { ...s.alert_thresholds, score: Number(e.currentTarget.value) } })} /></label>
            <label class="field" style={{ width: 150 }}><span>Price drop ≥ %</span>
              <input class="input" type="number" value={s.alert_thresholds.price_drop_pct} onChange={(e) => act('/admin/settings', { alert_thresholds: { ...s.alert_thresholds, price_drop_pct: Number(e.currentTarget.value) } })} /></label>
            <label class="field" style={{ width: 150 }}><span>AI cap £/month</span>
              <input class="input" type="number" min={0} max={200} value={s.ai_monthly_cap_gbp} onChange={(e) => act('/admin/settings', { ai_monthly_cap_gbp: Number(e.currentTarget.value) }, 'AI cap saved.')} /></label>
            <label class="field" style={{ width: 150 }}><span>WhatsApp cap/day</span>
              <input class="input" type="number" value={s.alert_thresholds.whatsapp_daily_cap} onChange={(e) => act('/admin/settings', { alert_thresholds: { ...s.alert_thresholds, whatsapp_daily_cap: Number(e.currentTarget.value) } })} /></label>
          </div>
          <div class="row">
            <span class="small">Email: {o.health.email_configured ? <span class="badge badge-good">configured</span> : <span class="badge badge-warn">not configured (links are logged only)</span>}</span>
            <span class="small">WhatsApp: <span class="badge">not connected</span></span>
            <button class="btn btn-sm" onClick={() => act('/admin/alerts/test', {}).then((r) => r && setMsg(`Test email: ${r.status}`))}>Send me a test email</button>
          </div>
        </section>

        <section class="card stack">
          <h2>Sources</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Source</th><th>Deals</th><th>Logging</th><th>Last run</th><th>Success</th><th /></tr></thead>
              <tbody>
                {o.sources.map((x) => (
                  <tr>
                    <td><strong>{x.name}</strong> <span class="tiny muted">{x.type}</span>{x.blocked ? <span class="badge badge-warn" style={{ marginLeft: 6 }}>blocked</span> : null}
                      <div class="tiny muted">{x.research_note}</div>{x.last_error && <div class="tiny error">{x.last_error}</div>}</td>
                    <td><input type="checkbox" aria-label={`Deal scans for ${x.name}`} checked={!!x.enabled} onChange={(e) => act(`/admin/sources/${x.id}`, { enabled: e.currentTarget.checked })} /></td>
                    <td><input type="checkbox" aria-label={`Price logging for ${x.name}`} checked={!!x.logging_enabled} onChange={(e) => act(`/admin/sources/${x.id}`, { logging_enabled: e.currentTarget.checked })} /></td>
                    <td class="small">{x.last_run_at ? `${ago(x.last_run_at)} · ${x.last_status}` : '–'}</td>
                    <td class="small">{x.runs_total ? `${Math.round((x.runs_ok / x.runs_total) * 100)}% of ${x.runs_total}` : '–'}</td>
                    <td class="row" style={{ gap: 4 }}>
                      <button class="btn btn-sm" onClick={() => act(`/admin/sources/${x.id}/run`, { kind: 'logging' }).then((r) => r && setMsg(r.error ? String(r.error) : `Queued ${r.jobs} searches (run #${r.runId}).`))}>Run now</button>
                      {!!x.blocked && <button class="btn btn-sm" onClick={() => act(`/admin/sources/${x.id}`, { unblock: true })}>Unblock</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card stack">
          <h2>Health</h2>
          <div class="row small">
            <span>Price snapshots: <strong>{o.health.snapshots.rows.toLocaleString()}</strong> rows · {o.health.snapshots.products.toLocaleString()} products · {o.health.snapshots.days} days{o.health.snapshots.last ? ` · last ${ago(o.health.snapshots.last)}` : ''}</span>
            <span>AI this month: <strong>£{o.health.ai.gbp.toFixed(2)}</strong> of £{s.ai_monthly_cap_gbp} cap ({o.health.ai.calls} calls)</span>
            <span>Alerts (7d): {o.health.alerts.map((a) => `${a.channel} ${a.status} ${a.n}`).join(', ') || 'none'}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Source</th><th>Kind</th><th>Started</th><th>Status</th><th>Pages</th><th>Items</th><th>Error</th></tr></thead>
              <tbody>
                {o.runs.map((r) => (
                  <tr><td>{r.id}</td><td>{r.source_id}</td><td>{r.kind}</td><td class="small">{ago(r.started_at)}</td><td>{r.status ?? 'running…'}</td><td>{r.pages}</td><td>{r.items}</td><td class="tiny">{r.error}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
