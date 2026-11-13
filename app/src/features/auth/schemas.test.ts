import {
  displayNameSchema,
  emailCodeSchema,
  emailSchema,
  newPasswordSchema,
  signUpSchema,
} from './schemas';

describe('emailSchema', () => {
  it('trims and lower-cases the address', () => {
    expect(emailSchema.parse('  Anas@Example.COM ')).toBe('anas@example.com');
  });

  it.each(['', 'anas', 'anas@', '@example.com'])('rejects %p', (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it('accepts 8 to 72 characters', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(8)).success).toBe(true);
    expect(newPasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
  });

  it('rejects shorter and longer passwords', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(7)).success).toBe(false);
    expect(newPasswordSchema.safeParse('a'.repeat(73)).success).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('trims the name', () => {
    expect(displayNameSchema.parse('  Zubair ')).toBe('Zubair');
  });

  it('rejects a blank name and one over 80 characters', () => {
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
    expect(displayNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
    expect(displayNameSchema.safeParse('a'.repeat(80)).success).toBe(true);
  });
});

describe('emailCodeSchema', () => {
  it('accepts exactly six digits', () => {
    expect(emailCodeSchema.safeParse('012345').success).toBe(true);
  });

  it.each(['12345', '1234567', '12a456', ' 123456'])('rejects %p', (value) => {
    expect(emailCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('returns the cleaned values', () => {
    expect(
      signUpSchema.parse({
        displayName: ' Ajmal ',
        email: ' AJMAL@example.com',
        password: 'correct horse',
      }),
    ).toEqual({ displayName: 'Ajmal', email: 'ajmal@example.com', password: 'correct horse' });
  });
});
