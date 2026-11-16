import { startingApartment } from './last-apartment';

describe('startingApartment', () => {
  it('opens the last apartment while the user is still in it', () => {
    expect(startingApartment(['a', 'b'], 'b')).toBe('b');
  });

  it('falls back to the first apartment after leaving the last one', () => {
    expect(startingApartment(['a', 'b'], 'gone')).toBe('a');
    expect(startingApartment(['a', 'b'], null)).toBe('a');
  });

  it('opens none when the user has no apartment', () => {
    expect(startingApartment([], 'gone')).toBeNull();
  });
});
