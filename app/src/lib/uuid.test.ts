import { randomUuid } from './uuid';

describe('randomUuid', () => {
  it('returns version 4 UUIDs', () => {
    expect(randomUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('returns a different value each time', () => {
    const values = new Set(Array.from({ length: 100 }, randomUuid));
    expect(values.size).toBe(100);
  });
});
