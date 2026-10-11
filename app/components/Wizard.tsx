import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, ACC_LABELS, ApiError, COUNTRY_FLAGS, fmtDate, gbp, type AccType, type Prefs, type Reference } from '../api';
import { Piste } from './bits';
import { RankList } from './RankList';

const DRAFT_KEY = 'bluebird:draft';
const UNLIMITED = 99999;

const blank: Prefs & { email: string } = {
  name: '', email: '', phone_e164: null, whatsapp_opt_in: false, status: 'in', budget_ceiling_gbp: 0,
  countries: [], resorts: [], accommodation: [], weeks: [], airports: [], last_minute: 'maybe',
  room_pref: 'twin', room_partner_name: null, notes: null,
};

type Mode = { kind: 'join'; token: string } | { kind: 'edit'; initial: Prefs };

export function Wizard({ reference, mode, onDone }: { reference: Reference; mode: Mode; onDone: (r: { email?: string; existing?: boolean }) => void }) {
  const [p, setP] = useState<Prefs & { email: string }>(() => {
    if (mode.kind === 'edit') return { ...blank, ...mode.initial, email: '', whatsapp_opt_in: !!mode.initial.whatsapp_opt_in };
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) return { ...blank, ...JSON.parse(d) };
    } catch { /* storage unavailable */ }
    return blank;
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof p>) => { setP((x) => ({ ...x, ...patch })); setError(''); };

  useEffect(() => {
    if (mode.kind !== 'join') return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }, [p]);

  const countryName = useMemo(() => new Map(reference.countries.map((c) => [c.code, c.name])), [reference]);

  const steps: { title: string; help?: string; valid: () => string | null; body: () => preact.JSX.Element; optional?: boolean }[] = [
    {
      title: 'About you',
      help: 'Just enough to keep you in the loop.',
      valid: () => (!p.name.trim() ? 'Add your name.' : mode.kind === 'join' && !/^\S+@\S+\.\S+$/.test(p.email) ? 'Add a valid email.' : p.whatsapp_opt_in && !/^\+[1-9]\d{6,14}$/.test(p.phone_e164 ?? '') ? 'Add your mobile in international format, e.g. +447700900123, or untick WhatsApp alerts.' : null),
      body: () => (
        <div class="stack">
          <label class="field"><span>Your name</span><input class="input" autocomplete="name" value={p.name} onInput={(e) => set({ name: e.currentTarget.value })} /></label>
          {mode.kind === 'join' && (
            <label class="field"><span>Email</span><input class="input" type="email" autocomplete="email" inputMode="email" value={p.email} onInput={(e) => set({ email: e.currentTarget.value })} />
              <small class="muted">We'll send you a link to confirm. No passwords.</small></label>
          )}
          <label class="field"><span>Mobile for WhatsApp alerts <span class="muted">(optional)</span></span>
            <input class="input" type="tel" autocomplete="tel" placeholder="+44 7700 900123" value={p.phone_e164 ?? ''} onInput={(e) => set({ phone_e164: e.currentTarget.value.replace(/[\s()-]/g, '') || null })} /></label>
          <label class="check"><input type="checkbox" checked={p.whatsapp_opt_in} onChange={(e) => set({ whatsapp_opt_in: e.currentTarget.checked })} />
            <span>Yes, send me Bluebird deal alerts on WhatsApp (max a few a day; only for this trip).</span></label>
        </div>
      ),
    },
    {
      title: 'Are you in?',
      help: "Be honest, it helps pick a week that actually works.",
      valid: () => null,
      body: () => (
        <div class="tiles" role="radiogroup">
          {([['in', "I'm in", 'Count me in'], ['interested', 'Interested', 'Keen, not sure yet']] as const).map(([v, l, s]) => (
            <button type="button" role="radio" class="tile" aria-checked={p.status === v} onClick={() => set({ status: v })}>{l}<small>{s}</small></button>
          ))}
        </div>
      ),
    },
    {
      title: 'Budget',
      help: 'Per person for flights, transfers and accommodation for the week, sharing a room. Lift pass and hire not included.',
      valid: () => (!p.budget_ceiling_gbp ? 'Pick a budget band.' : null),
      body: () => (
        <div class="tiles" role="radiogroup" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {reference.bands.map((b) => {
            const ceil = b.ceiling ?? UNLIMITED;
            return (
              <button type="button" role="radio" class="tile" aria-checked={p.budget_ceiling_gbp === ceil} onClick={() => set({ budget_ceiling_gbp: ceil })}>
                <span class="row" style={{ gap: 8 }}><Piste band={b} /> {b.label}</span>
                <span>{b.ceiling ? (b.min ? `${gbp(b.min)} – ${gbp(b.ceiling)}` : `Up to ${gbp(b.ceiling)}`) : `${gbp(b.min)}+`}</span>
                <small>{b.note}</small>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: 'Where?',
      help: 'Tap the countries you would go to, then put your favourite first.',
      valid: () => (!p.countries.length ? 'Pick at least one country.' : null),
      body: () => (
        <RankList
          options={reference.countries.map((c) => ({ id: c.code, text: c.name, label: <>{COUNTRY_FLAGS[c.code]} {c.name}</> }))}
          value={p.countries}
          onChange={(countries) => set({ countries, resorts: p.resorts.filter((r) => countries.includes(reference.resorts.find((x) => x.id === r)?.country_code ?? '')) })}
          emptyHint="Nothing picked yet."
        />
      ),
    },
    {
      title: 'Favourite resorts',
      help: 'Optional. Pick and rank up to 5 if you have strong feelings. Skip if not.',
      optional: true,
      valid: () => null,
      body: () => (
        <RankList
          max={5}
          options={reference.resorts
            .filter((r) => p.countries.includes(r.country_code))
            .sort((a, b) => p.countries.indexOf(a.country_code) - p.countries.indexOf(b.country_code) || a.name.localeCompare(b.name))
            .map((r) => ({ id: r.id, text: r.name, label: <>{COUNTRY_FLAGS[r.country_code]} {r.name}</>, sub: `${countryName.get(r.country_code)} · top lift ${r.top_altitude_m.toLocaleString()}m${r.glacier ? ' · glacier' : ''}` }))}
          value={p.resorts}
          onChange={(resorts) => set({ resorts })}
          emptyHint="No favourites yet, which is fine."
        />
      ),
    },
    {
      title: 'Where to stay',
      help: 'Pick every type you would be happy with. (No self-catering on this trip.)',
      valid: () => (!p.accommodation.length ? 'Pick at least one.' : null),
      body: () => (
        <div class="tiles">
          {(Object.keys(ACC_LABELS) as AccType[]).map((t) => {
            const on = p.accommodation.includes(t);
            const sub = { catered_chalet: 'Chalet host cooks, wine with dinner', chalet_hotel: 'Chalet-style catering in a hotel', hotel: 'Usually half board' }[t];
            return (
              <button type="button" class="tile" aria-pressed={on} onClick={() => set({ accommodation: on ? p.accommodation.filter((x) => x !== t) : [...p.accommodation, t] })}>
                {ACC_LABELS[t]}<small>{sub}</small>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: 'Which weeks?',
      help: 'Saturday to Saturday, 2027. Add every week you could do and drag your favourite to the top. Any week you leave out means you can’t go.',
      valid: () => (!p.weeks.length ? 'Pick at least one week you could do.' : null),
      body: () => (
        <RankList
          options={reference.weeks.map((w) => ({
            id: w.start_date,
            text: w.label,
            label: <>{fmtDate(w.start_date, { weekday: 'short', day: 'numeric', month: 'short' })} – {fmtDate(addDays(w.start_date, 7), { day: 'numeric', month: 'short' })}</>,
            sub: w.badge ?? undefined,
          }))}
          value={p.weeks}
          onChange={(weeks) => set({ weeks })}
          emptyHint="No weeks yet. Tap the ones you could do."
        />
      ),
    },
    {
      title: 'Flying from',
      help: 'Every airport you would happily fly from.',
      valid: () => (!p.airports.length ? 'Pick at least one airport.' : null),
      body: () => (
        <div class="stack">
          {(['london', 'regional'] as const).map((g) => {
            const list = reference.airports.filter((a) => a.grp === g);
            const all = list.every((a) => p.airports.includes(a.iata));
            return (
              <div>
                <div class="row" style={{ marginBottom: 8 }}>
                  <h3>{g === 'london' ? 'London' : 'Regional'}</h3>
                  <span class="spacer" />
                  <button type="button" class="btn btn-sm btn-ghost" onClick={() => set({ airports: all ? p.airports.filter((x) => !list.some((a) => a.iata === x)) : [...new Set([...p.airports, ...list.map((a) => a.iata)])] })}>
                    {all ? 'Clear' : 'All ' + (g === 'london' ? 'London' : 'regional')}
                  </button>
                </div>
                <div class="tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  {list.map((a) => {
                    const on = p.airports.includes(a.iata);
                    return (
                      <button type="button" class="tile" aria-pressed={on} onClick={() => set({ airports: on ? p.airports.filter((x) => x !== a.iata) : [...p.airports, a.iata] })}>
                        {a.name}<small>{a.iata}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      title: 'Last-minute?',
      help: 'Would you consider booking very late (days before) for a good deal?',
      valid: () => null,
      body: () => (
        <div class="tiles" role="radiogroup">
          {([['yes', 'Yes', 'Living on the edge'], ['maybe', 'Maybe', 'If it is a cracker'], ['no', 'No', 'I need to plan']] as const).map(([v, l, s]) => (
            <button type="button" role="radio" class="tile" aria-checked={p.last_minute === v} onClick={() => set({ last_minute: v })}>{l}<small>{s}</small></button>
          ))}
        </div>
      ),
    },
    {
      title: 'Room',
      help: 'Single supplements change the per-person price, so this helps us compare properly.',
      optional: true,
      valid: () => (p.room_pref === 'partner' && !p.room_partner_name?.trim() ? "Add your partner's name." : null),
      body: () => (
        <div class="stack">
          <div class="tiles" role="radiogroup">
            {([['twin', 'Happy to share', 'A twin with a mate'], ['own', 'Own room', 'Happy to pay extra'], ['partner', 'With my partner', 'Who is also coming']] as const).map(([v, l, s]) => (
              <button type="button" role="radio" class="tile" aria-checked={p.room_pref === v} onClick={() => set({ room_pref: v })}>{l}<small>{s}</small></button>
            ))}
          </div>
          {p.room_pref === 'partner' && (
            <label class="field"><span>Partner's name</span><input class="input" value={p.room_partner_name ?? ''} onInput={(e) => set({ room_partner_name: e.currentTarget.value })} /></label>
          )}
        </div>
      ),
    },
    {
      title: 'Anything else?',
      help: 'Optional. Dietary needs, dates you can’t do, strong opinions on après…',
      optional: true,
      valid: () => null,
      body: () => (
        <div class="stack">
          <textarea class="input" maxLength={1000} value={p.notes ?? ''} onInput={(e) => set({ notes: e.currentTarget.value || null })} />
          {mode.kind === 'join' && <PrivacyNote />}
        </div>
      ),
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  const next = async () => {
    const problem = s.valid();
    if (problem) return setError(problem);
    if (!last) { setStep(step + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true);
    try {
      const { email, ...prefs } = p;
      const body = { ...prefs, phone_e164: p.phone_e164 || null, name: p.name.trim() };
      if (mode.kind === 'join') {
        const r = await api<{ ok: true; existing?: boolean }>('/join', { body: { ...body, email: email.trim().toLowerCase(), token: mode.token } });
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        onDone({ email, existing: r.existing });
      } else {
        await api('/me', { method: 'PUT', body });
        onDone({});
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="card wizard">
      <div class="progress" aria-hidden="true">{steps.map((_, i) => <span class={i <= step ? 'done' : ''} />)}</div>
      <p class="tiny muted" aria-live="polite">Step {step + 1} of {steps.length}{s.optional ? ' · optional' : ''}</p>
      <h2 class="step-title">{s.title}</h2>
      {s.help && <p class="step-help">{s.help}</p>}
      {s.body()}
      {error && <p class="error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      <div class="wizard-nav">
        {step > 0 && <button type="button" class="btn" onClick={() => { setStep(step - 1); setError(''); }}>Back</button>}
        <button type="button" class="btn btn-sun" disabled={busy} onClick={next}>
          {busy ? 'Saving…' : last ? (mode.kind === 'join' ? "Done, I'm in!" : 'Save preferences') : s.optional && isEmptyOptional(step, p) ? 'Skip' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function isEmptyOptional(step: number, p: Prefs) {
  if (step === 4) return !p.resorts.length;
  if (step === 10) return !p.notes;
  return false;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function PrivacyNote() {
  return (
    <details class="small muted">
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>What we store and why</summary>
      <p style={{ marginTop: 8 }}>
        Bluebird stores your name, email, optional mobile number and the trip preferences you give here, only to plan this one ski trip.
        Other members see your first name, whether you're in, and your week votes, never your email or phone number.
        Your number is only used for Bluebird alerts if you tick the WhatsApp box. There's no advertising or tracking.
        Everything is deleted on request, or automatically three months after we get back.
      </p>
    </details>
  );
}
