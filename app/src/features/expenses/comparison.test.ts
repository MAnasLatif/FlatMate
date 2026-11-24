import { barPercent, describeChange } from './comparison';

const month = (date: string, totalMinor: number) => ({ month: date, totalMinor, myShareMinor: 0 });

describe('describeChange', () => {
  it('says how much more or less was spent than the month before', () => {
    expect(describeChange(month('2026-11-01', 150000), month('2026-10-01', 30000), 'PKR')).toBe(
      'Rs 1,200.00 more than October 2026',
    );
    expect(describeChange(month('2026-11-01', 30000), month('2026-10-01', 150000), 'PKR')).toBe(
      'Rs 1,200.00 less than October 2026',
    );
    expect(describeChange(month('2026-11-01', 500), month('2026-10-01', 500), 'PKR')).toBe(
      'Same as October 2026',
    );
  });

  it('says nothing for the first month shown', () => {
    expect(describeChange(month('2026-06-01', 500), undefined, 'PKR')).toBeNull();
  });
});

describe('barPercent', () => {
  it('scales to the largest month', () => {
    expect(barPercent(50000, 200000)).toBe(25);
    expect(barPercent(200000, 200000)).toBe(100);
  });

  it('shows a sliver for a small amount and nothing for none', () => {
    expect(barPercent(1, 1000000)).toBe(2);
    expect(barPercent(0, 1000000)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
  });
});
