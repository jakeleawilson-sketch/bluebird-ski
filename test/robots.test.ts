import { describe, expect, it } from 'vitest';
import { isAllowed, parseRobots } from '../worker/sources/robots';

const txt = `
User-agent: *
Disallow: /admin/
Disallow: /*?referrersiteid=*
Allow: /admin/public

User-agent: LamarkBot
Disallow: /
`;

describe('robots', () => {
  const rules = parseRobots(txt, 'bluebirdskiplanner');
  it('applies the * group', () => {
    expect(isAllowed(rules, '/ski-holidays?date=16012027')).toBe(true);
    expect(isAllowed(rules, '/admin/x')).toBe(false);
    expect(isAllowed(rules, '/admin/public/x')).toBe(true);
    expect(isAllowed(rules, '/ski-deals?referrersiteid=4')).toBe(false);
  });
  it('uses a specific group when one names us', () => {
    const r = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: BluebirdSkiPlanner\nDisallow: /', 'bluebirdskiplanner');
    expect(isAllowed(r, '/anything')).toBe(false);
  });
  it('treats empty Disallow as allow-all', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:', 'x'), '/a')).toBe(true);
  });
});
