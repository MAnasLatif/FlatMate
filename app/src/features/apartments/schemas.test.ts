import { categoryNameSchema, apartmentFormSchema, joinCodeSchema } from './schemas';

const validApartment = {
  name: ' Flat 4B ',
  location: '  ',
  showLocation: false,
  timezone: 'Asia/Karachi',
  settlementDay: '5',
  approvalDays: '7',
  currency: 'pkr',
};

describe('apartmentFormSchema', () => {
  it('cleans the values and turns numbers into numbers', () => {
    expect(apartmentFormSchema.parse(validApartment)).toEqual({
      name: 'Flat 4B',
      location: null,
      showLocation: false,
      timezone: 'Asia/Karachi',
      settlementDay: 5,
      approvalDays: 7,
      currency: 'PKR',
    });
  });

  it.each(['0', '32', '1.5', 'five', ''])('rejects settlement day %p', (settlementDay) => {
    expect(apartmentFormSchema.safeParse({ ...validApartment, settlementDay }).success).toBe(false);
  });

  it.each(['1', '31'])('accepts settlement day %p', (settlementDay) => {
    expect(apartmentFormSchema.safeParse({ ...validApartment, settlementDay }).success).toBe(true);
  });

  it('rejects an objection window outside 1 to 30 days', () => {
    expect(apartmentFormSchema.safeParse({ ...validApartment, approvalDays: '0' }).success).toBe(
      false,
    );
    expect(apartmentFormSchema.safeParse({ ...validApartment, approvalDays: '31' }).success).toBe(
      false,
    );
  });

  it('rejects a currency that is not 3 letters', () => {
    expect(apartmentFormSchema.safeParse({ ...validApartment, currency: 'RS' }).success).toBe(
      false,
    );
    expect(apartmentFormSchema.safeParse({ ...validApartment, currency: 'PK1' }).success).toBe(
      false,
    );
  });

  it('rejects a blank name', () => {
    expect(apartmentFormSchema.safeParse({ ...validApartment, name: '   ' }).success).toBe(false);
  });
});

describe('joinCodeSchema', () => {
  it.each(['7kq2-m9xd', '7KQ2 M9XD', '7KQ2M9XD'])('accepts %p as 7KQ2M9XD', (code) => {
    expect(joinCodeSchema.parse({ code })).toEqual({ code: '7KQ2M9XD' });
  });

  it.each(['7KQ2-M9X', '7KQ2-M9XDA', ''])('rejects %p', (code) => {
    expect(joinCodeSchema.safeParse({ code }).success).toBe(false);
  });
});

describe('categoryNameSchema', () => {
  it('trims and limits the name', () => {
    expect(categoryNameSchema.parse('  Gas ')).toBe('Gas');
    expect(categoryNameSchema.safeParse('a'.repeat(41)).success).toBe(false);
  });
});
