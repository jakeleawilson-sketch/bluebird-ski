import { describe, expect, it } from 'vitest';
import { preferencePoints, topWeek, weekLeaderboard, type WeekVoter } from '../worker/lib/weeks';

const W = ['2027-01-09', '2027-01-16', '2027-01-23', '2027-03-06'];

describe('preferencePoints', () => {
  it('gives 1.0 to the top pick and scales by number ranked', () => {
    expect(preferencePoints(1, 4)).toBe(1);
    expect(preferencePoints(4, 4)).toBe(0.25);
    expect(preferencePoints(1, 1)).toBe(1);
  });
});

describe('weekLeaderboard', () => {
  it('ranks by weighted availability first', () => {
    const voters: WeekVoter[] = [
      { id: 'a', name: 'Ann', status: 'in', rankedWeeks: ['2027-01-09', '2027-01-16'] },
      { id: 'b', name: 'Bob', status: 'in', rankedWeeks: ['2027-01-16'] },
      { id: 'c', name: 'Cat', status: 'interested', rankedWeeks: ['2027-01-09'] },
    ];
    const board = weekLeaderboard(W, voters);
    // 16 Jan: 2.0 available; 9 Jan: 1.5
    expect(board[0].start).toBe('2027-01-16');
    expect(board[0].available).toBe(2);
    expect(board[0].inCount).toBe(2);
    expect(board[1].start).toBe('2027-01-09');
    expect(board[1].available).toBe(1.5);
    expect(board[1].interestedCount).toBe(1);
    expect(topWeek(board)).toBe('2027-01-16');
  });

  it('breaks availability ties on preference points', () => {
    const voters: WeekVoter[] = [
      { id: 'a', name: 'Ann', status: 'in', rankedWeeks: ['2027-03-06', '2027-01-23'] },
      { id: 'b', name: 'Bob', status: 'in', rankedWeeks: ['2027-03-06', '2027-01-23'] },
    ];
    const board = weekLeaderboard(W, voters);
    expect(board[0].start).toBe('2027-03-06');
    expect(board[0].preference).toBe(2);
    expect(board[1].preference).toBe(1);
  });

  it('stops people who tick many weeks from dominating preference', () => {
    const voters: WeekVoter[] = [
      { id: 'a', name: 'Ann', status: 'in', rankedWeeks: W },
      { id: 'b', name: 'Bob', status: 'in', rankedWeeks: ['2027-01-23'] },
    ];
    const board = weekLeaderboard(W, voters);
    expect(board[0].start).toBe('2027-01-23'); // both available
    expect(board[0].preference).toBeCloseTo(1 + 0.5);
  });

  it('ignores weeks that are not candidates (e.g. hidden)', () => {
    const board = weekLeaderboard(['2027-01-09'], [{ id: 'a', name: 'Ann', status: 'in', rankedWeeks: ['2027-02-13', '2027-01-09'] }]);
    expect(board).toHaveLength(1);
    expect(board[0].preference).toBe(1); // re-ranked among visible weeks
  });

  it('returns null top week when nobody is available', () => {
    expect(topWeek(weekLeaderboard(W, []))).toBeNull();
  });
});
