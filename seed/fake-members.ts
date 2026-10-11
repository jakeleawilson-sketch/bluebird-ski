// Six fake, verified members with varied preferences, for LOCAL testing only.
// npx tsx seed/fake-members.ts > /tmp/fake.sql && wrangler d1 execute bluebird --local --file /tmp/fake.sql
const people = [
  { name: 'Sam Fake', status: 'in', budget: 950, countries: ['FR', 'AT'], resorts: ['val-thorens', 'tignes'], acc: ['catered_chalet'], airports: ['LGW', 'LHR', 'STN'], weeks: ['2027-01-16', '2027-01-09', '2027-03-06'], lm: 'yes' },
  { name: 'Priya Fake', status: 'in', budget: 1250, countries: ['FR', 'CH', 'IT'], resorts: ['verbier'], acc: ['catered_chalet', 'chalet_hotel'], airports: ['LHR', 'LGW'], weeks: ['2027-01-16', '2027-01-23'], lm: 'maybe' },
  { name: 'Tom Fake', status: 'in', budget: 1250, countries: ['AT', 'FR'], resorts: ['st-anton', 'ischgl'], acc: ['hotel', 'catered_chalet'], airports: ['MAN'], weeks: ['2027-01-23', '2027-01-16', '2027-03-13'], lm: 'no' },
  { name: 'Lou Fake', status: 'interested', budget: 700, countries: ['AD', 'BG', 'FR'], resorts: [], acc: ['hotel'], airports: ['STN', 'LTN', 'LGW'], weeks: ['2027-01-09', '2027-01-16'], lm: 'yes' },
  { name: 'Ben Fake', status: 'in', budget: 1600, countries: ['CH', 'FR', 'AT', 'IT'], resorts: ['zermatt', 'val-disere'], acc: ['catered_chalet', 'chalet_hotel', 'hotel'], airports: ['LHR', 'LCY', 'LGW'], weeks: ['2027-03-06', '2027-03-13', '2027-01-16'], lm: 'maybe' },
  { name: 'Ana Fake', status: 'interested', budget: 2750, countries: ['CA', 'US', 'FR'], resorts: ['whistler'], acc: ['chalet_hotel', 'hotel'], airports: ['LHR'], weeks: ['2027-02-27', '2027-03-06'], lm: 'no' },
];
const q = (v: unknown) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const out: string[] = [];
people.forEach((p, i) => {
  const id = `fake-${i + 1}`;
  out.push(`DELETE FROM members WHERE id = ${q(id)};`);
  out.push(`INSERT INTO members (id, name, email, email_verified_at, status, budget_ceiling_gbp, last_minute, room_pref) VALUES (${[id, p.name, `fake${i + 1}@example.com`, '2026-10-08T12:00:00Z', p.status, p.budget, p.lm, 'twin'].map(q).join(', ')});`);
  p.countries.forEach((c, r) => out.push(`INSERT INTO member_countries VALUES (${q(id)}, ${q(c)}, ${r + 1});`));
  p.resorts.forEach((c, r) => out.push(`INSERT INTO member_resorts VALUES (${q(id)}, ${q(c)}, ${r + 1});`));
  p.acc.forEach((c) => out.push(`INSERT INTO member_accommodation VALUES (${q(id)}, ${q(c)});`));
  p.airports.forEach((c) => out.push(`INSERT INTO member_airports VALUES (${q(id)}, ${q(c)});`));
  p.weeks.forEach((c, r) => out.push(`INSERT INTO member_weeks VALUES (${q(id)}, ${q(c)}, ${r + 1});`));
});
console.log(out.join('\n'));
