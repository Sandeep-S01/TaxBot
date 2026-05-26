import { describe, it, expect } from 'vitest';
import { getPreviousMonthPeriod } from '../src/jobs/reminders';

describe('Previous Month Period Calculation', () => {
  it('should calculate the correct previous month period', () => {
    const today = new Date();
    let expectedMonth = today.getMonth(); // previous month since it's 0-indexed
    let expectedYear = today.getFullYear();
    
    if (expectedMonth === 0) {
      expectedMonth = 12;
      expectedYear -= 1;
    }
    
    const expectedPeriod = `${expectedYear}-${String(expectedMonth).padStart(2, '0')}`;
    expect(getPreviousMonthPeriod()).toBe(expectedPeriod);
  });
});
