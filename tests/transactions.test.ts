import { describe, it, expect } from 'vitest';
import { periodToDateRange } from '../src/db/transactions';

describe('Period to Date Range Conversion', () => {
  it('should correctly calculate the start and end of months for standard months', () => {
    // May has 31 days
    expect(periodToDateRange('2026-05')).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });

    // April has 30 days
    expect(periodToDateRange('2026-04')).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
  });

  it('should correctly handle leap years and standard Februaries', () => {
    // 2024 is a leap year (February has 29 days)
    expect(periodToDateRange('2024-02')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });

    // 2026 is not a leap year (February has 28 days)
    expect(periodToDateRange('2026-02')).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('should throw an error for invalid period formats', () => {
    expect(() => periodToDateRange('2026-13')).toThrow();
    expect(() => periodToDateRange('invalid-period')).toThrow();
    expect(() => periodToDateRange('26-05')).toThrow();
  });
});
