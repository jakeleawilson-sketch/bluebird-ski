// The last-minute guide (HANDOFF 9a). Every factual claim cites a source that
// was opened and checked on 9 Oct 2026; anything that is Bluebird's own
// reasoning or estimate is labelled as such.
import type { ComponentChildren } from 'preact';

export const SOURCES = [
  { title: 'Snowfinders: Ski deals', url: 'https://www.snowfinders.co.uk/deals/', note: 'UK ski agent' },
  { title: 'WeSki: Best time to book a ski holiday (30 Aug 2026)', url: 'https://www.weski.com/en-us/guides/best-time-to-book-ski-holiday', note: 'Ski package seller' },
  { title: 'SkiWeekends: When is the best time to book a ski holiday (10 Apr 2024)', url: 'https://www.skiweekends.com/news/when-is-the-best-time-to-book-a-ski-holiday', note: 'Ski operator' },
  { title: 'Skiworld: Last minute ski holidays', url: 'https://www.skiworld.co.uk/ski-deals/last-minute-offers', note: 'Ski operator' },
  { title: 'Skiworld: Ski holiday news 2026/27', url: 'https://www.skiworld.co.uk/blog/ski-holiday-news-2026-27/', note: 'Ski operator' },
  { title: 'InTheSnow: Skiworld "Lift & Pour" free lift pass offer 2027', url: 'https://www.inthesnow.com/skiworld-lift-pour-free-lift-pass-wine-offer-2027/', note: 'Ski news site' },
  { title: 'InTheSnow: February half-term ski holiday prices triple (30 Jul 2018)', url: 'https://www.inthesnow.com/february-half-term-ski-holiday-prices-triple/', note: 'Ski news site' },
  { title: 'InTheSnow: Last remaining ski chalet rooms, save up to £400pp (5 Mar 2026)', url: 'https://www.inthesnow.com/deals/ski-holiday-deals/last-remaining-ski-chalet-rooms-save-up-to-400pp/', note: 'Ski news site' },
  { title: 'PlanetSKI: March and April ski deals (18 Feb 2025)', url: 'https://planetski.eu/2025/02/18/march-and-april-ski-deals-2/', note: 'Ski news site' },
  { title: 'TravelMole: Late ski deals (16 Dec 2015)', url: 'https://travelmole.com/news/late-ski-deals-4', note: 'Travel trade news' },
  { title: 'Sno: Last minute ski holidays', url: 'https://www.sno.co.uk/ski/last-minute-deals/', note: 'Ski agent' },
];

const Cite = ({ n }: { n: number }) => (
  <sup><a href={`#src-${n}`} aria-label={`Source ${n}`} style={{ textDecoration: 'none', fontWeight: 700 }}>[{n}]</a></sup>
);

const Ours = ({ children }: { children: ComponentChildren }) => (
  <span class="badge badge-sun" style={{ whiteSpace: 'normal', fontWeight: 600 }} title="Bluebird's own reasoning, not a sourced fact">{children}</span>
);

export function Guide() {
  return (
    <div class="stack guide">
      <section class="card">
        <h2>The short answer</h2>
        <p>
          For a non-holiday week like ours, the sources mostly agree on one thing: <strong>the best price is usually there early</strong>, and quiet weeks are priced keenly from the start rather than slashed at the end.<Cite n={2} /><Cite n={3} />{' '}
          Big late cuts do happen, and we've found real ones of 33 to 46% below. But they're on whatever is left unsold, so they reward a group that's flexible about where it goes, not one with its heart set on a particular chalet.<Cite n={8} /><Cite n={10} />
        </p>
        <p class="small muted" style={{ margin: 0 }}>
          Most sources here sell ski holidays, so treat their advice with that in mind. Where they disagree, both sides are shown. Bluebird's own estimates are marked <Ours>Bluebird estimate</Ours>.
        </p>
      </section>

      <section class="card">
        <h2>How operators price a season</h2>
        <ul>
          <li>Prices for the next season start appearing around January, and early-booking offers mostly disappear by May or June.<Cite n={1} /></li>
          <li>Prices are then nudged up through summer and autumn as brochure editions are revised.<Cite n={1} /></li>
          <li>Peak weeks (Christmas, New Year, February half term, Easter) hold their prices because demand outstrips supply. Operators say it's unlikely you'll find a deal on the most popular dates.<Cite n={2} /><Cite n={4} /></li>
          <li>Late availability deals exist to clear "perishable stock", and they're normally not combinable with other offers.<Cite n={1} /></li>
          <li>Skiworld adds its late deals roughly six to ten weeks before departure.<Cite n={4} /></li>
        </ul>
      </section>

      <section class="card">
        <h2>Do prices really drop at the last minute?</h2>
        <div class="two-col">
          <div>
            <h3 style={{ marginBottom: 6 }}>Yes, sometimes</h3>
            <ul>
              <li>Ski Beat cut its last chalet rooms in La Rosière and La Tania to £799pp from £1,199, about 9 to 16 days before departure (March 2026).<Cite n={8} /></li>
              <li>Inghams advertised £200 to £400pp off March 2025 hotels and chalets three to five weeks before departure.<Cite n={9} /></li>
              <li>Ski Total sold a La Tania chalet week for £419pp, down from £769, 18 days before a January departure (2016).<Cite n={10} /></li>
              <li>Agents' late-deal pages headline cuts of around 50%, though the biggest are often self-catered apartments, which we're not considering.<Cite n={11} /></li>
            </ul>
          </div>
          <div>
            <h3 style={{ marginBottom: 6 }}>No, not reliably</h3>
            <ul>
              <li>One seller says ski "doesn't follow the same last-minute discount pattern as beach holidays", and the quietest weeks are priced competitively from the outset.<Cite n={2} /></li>
              <li>An operator says real-time pricing has made a true last-minute deal "quite rare", and what's left is often expensive and in resorts that weren't your first choice.<Cite n={3} /></li>
              <li>Groups are "far better off booking in advance" for choice and price. A late deal mainly makes sense if it gets you under about £500pp.<Cite n={1} /></li>
            </ul>
          </div>
        </div>
        <p class="notice small" style={{ marginTop: 12, marginBottom: 0 }}>
          <strong>Why both can be true:</strong> advertised late deals are survivors. You see the discount on what didn't sell, never on the chalets that sold out months ago. So "50% off" is real, but it's 50% off a holiday most people passed over.{' '}
          <Ours>Bluebird reasoning</Ours>
        </p>
      </section>

      <section class="card">
        <h2>Which weeks cost more</h2>
        <ul>
          <li>February half term can cost "up to three times" a low-season week for some holidays.<Cite n={7} /> Bluebird's own data (the chart above) measures this live for 2027.</li>
          <li>Easter and the week before it are also busier, which is why 20 March carries a "start of Easter" badge in the week list.</li>
        </ul>
      </section>

      <section class="card">
        <h2>Offers to know about for 2027</h2>
        <ul>
          <li>
            <strong>Skiworld free lift pass:</strong> worth up to £427pp on selected 7-night catered chalet holidays with charter flights departing 6/7 Feb, 20/21 Feb and 13/14 Mar 2027.<Cite n={5} /><Cite n={6} /> It launched in June 2026, so check it's still running before relying on it. Lift passes aren't in our comparison price, so on those dates a Skiworld chalet is worth more than its price suggests.
          </li>
          <li>Skiworld also has a free group-leader lift pass, but only for groups of 10 or more.<Cite n={5} /></li>
        </ul>
      </section>

      <section class="card">
        <h2>Tactics for a flexible group of 4 to 6</h2>
        <ul>
          <li><strong>Be flexible on airport and resort.</strong> Late stock is scattered. Bluebird already searches every member's airports and every country anyone picked.</li>
          <li><strong>Know your walk-away price.</strong> Agree what a good deal is (say 20% under the group budget) so you can book the same day. Late deals go quickly.<Cite n={1} /></li>
          <li><strong>Watch from about 10 weeks out.</strong> That's when late-deal pages fill up.<Cite n={4} /> <Ours>Bluebird checks every 6 hours from 14 days out, and every 3 hours in the final 72 if anyone said yes to last-minute</Ours></li>
          <li><strong>Mind the flight seats.</strong> Five or six people on the same flight is the hard part late on. A chalet can have beds when the plane is full. <Ours>Bluebird reasoning</Ours></li>
          <li><strong>A small whole chalet suits us.</strong> Chalets for 4 to 6 are a niche that is either gone early or awkward to fill, which is exactly when operators cut prices. <Ours>Bluebird reasoning</Ours></li>
        </ul>
      </section>
    </div>
  );
}

export type Estimate = { claim: string; week: string; chance: string; confidence: 'Low' | 'Medium' | 'High'; why: string };

/** Research-based priors (HANDOFF 9a). Replaced over time by the measured table below it. */
export const ESTIMATES: Estimate[] = [
  { claim: 'Some catered chalet or hotel package for our week at least 20% below its early price, within 14 days of departure', week: 'Non-holiday week', chance: 'Likely (60–80%)', confidence: 'Medium', why: 'Every late-deal list we checked from non-holiday weeks had 20–40% cuts on catered chalets or hotels (Ski Beat 2026, Inghams 2025, Ski Total 2016).' },
  { claim: '…at least 40% below', week: 'Non-holiday week', chance: 'Possible (20–40%)', confidence: 'Low', why: 'Seen (Ski Total 46%, 2016), but most 40%+ headlines are self-catered apartments.' },
  { claim: '…at least 50% below', week: 'Non-holiday week', chance: 'Unlikely (5–15%)', confidence: 'Low', why: 'We found no verified 50%+ cut on a catered chalet or hotel package.' },
  { claim: 'A chalet the group actually shortlisted drops 20%+ in the final 2 weeks', week: 'Any', chance: 'Unlikely (10–25%)', confidence: 'Low', why: 'Popular chalets sell first. Late deals are, by definition, the ones that didn’t.' },
  { claim: 'Any package at least 20% below its early price within 14 days', week: 'Half term / Easter', chance: 'Unlikely (under 15%)', confidence: 'Medium', why: 'Peak weeks hold their price; operators say deals on popular peak dates are unlikely.' },
];

export function Sources() {
  return (
    <section class="card">
      <h2>Sources</h2>
      <p class="small muted">Each one was opened and checked on 9 October 2026.</p>
      <ol class="small" style={{ paddingLeft: 22, margin: 0 }}>
        {SOURCES.map((s, i) => (
          <li id={`src-${i + 1}`} style={{ marginBottom: 4 }}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> <span class="muted">· {s.note}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
