import { dueReminderChoices, settlementReminderChoices } from './reminders';

describe('reminder choices', () => {
  it('offers the day itself for due dates, but not for settlement', () => {
    expect(dueReminderChoices(1).map((choice) => choice.label)).toEqual([
      'On the day only',
      '1 day before',
      '2 days before',
      '3 days before',
      '7 days before',
    ]);
    expect(settlementReminderChoices(2).map((choice) => choice.value)).toEqual([
      '1',
      '2',
      '3',
      '7',
    ]);
  });

  it('keeps a value set elsewhere visible, in order', () => {
    expect(settlementReminderChoices(5).map((choice) => choice.value)).toEqual([
      '1',
      '2',
      '3',
      '5',
      '7',
    ]);
  });

  it('adds nothing for a reminder that is off', () => {
    expect(dueReminderChoices(null)).toHaveLength(5);
  });
});
