import {
  APARTMENT_CHANGE_KINDS,
  apartmentTopicKeys,
  keysForApartmentChange,
  keysForUserChange,
  USER_CHANGE_KINDS,
  userTopicKeys,
} from './changes';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

const apartmentId = 'apartment-1';
const userId = 'user-1';

describe('apartment change events', () => {
  it('maps every kind the database sends', () => {
    // The entity types of audit_events, and the profile and account triggers.
    const sentByDatabase = [
      'adjustment',
      'apartment',
      'budget',
      'category',
      'expense',
      'expense_template',
      'invite',
      'join_request',
      'member',
      'offset',
      'payment',
      'recurring_bill',
      'recurring_template',
      'rejoin_invite',
      'settlement_period',
      'profile',
      'account',
    ];
    expect([...APARTMENT_CHANGE_KINDS].sort()).toEqual([...sentByDatabase].sort());
    for (const kind of APARTMENT_CHANGE_KINDS) {
      expect(keysForApartmentChange(kind, apartmentId).length).toBeGreaterThan(0);
    }
  });

  it('refreshes all of an apartment money for any financial change', () => {
    for (const kind of [
      'expense',
      'payment',
      'offset',
      'adjustment',
      'settlement_period',
      'budget',
    ]) {
      expect(keysForApartmentChange(kind, apartmentId)).toContainEqual(['money', apartmentId]);
    }
  });

  it('refreshes members and balances when membership changes', () => {
    expect(keysForApartmentChange('member', apartmentId)).toEqual([
      ['apartments', apartmentId, 'members'],
      ['money', apartmentId],
    ]);
  });

  it('refreshes names when someone renames themselves', () => {
    expect(keysForApartmentChange('profile', apartmentId)).toContainEqual(['profile-names']);
  });

  it('refreshes everything about the apartment for a kind it does not know', () => {
    expect(keysForApartmentChange('something-new', apartmentId)).toEqual(
      apartmentTopicKeys(apartmentId),
    );
    expect(keysForApartmentChange(null, apartmentId)).toEqual(apartmentTopicKeys(apartmentId));
  });

  it('never refreshes another apartment', () => {
    for (const key of apartmentTopicKeys(apartmentId)) {
      expect(JSON.stringify(key)).not.toContain('apartment-2');
    }
  });
});

describe('user change events', () => {
  it('maps every kind the database sends', () => {
    expect([...USER_CHANGE_KINDS].sort()).toEqual([
      'account',
      'membership',
      'notification',
      'notification_preference',
      'profile',
    ]);
  });

  it('refreshes the apartment list and member lists when added or removed', () => {
    const keys = keysForUserChange('membership', userId);
    expect(keys).toContainEqual(['apartments', 'mine']);
    expect(keys).toContainEqual(['apartments']);
    expect(keys).toContainEqual(['exits', userId]);
  });

  it('refreshes the user own profile and accounts', () => {
    expect(keysForUserChange('profile', userId)).toEqual([['profile', userId]]);
    expect(keysForUserChange('account', userId)).toEqual([['accounts', 'mine', userId]]);
  });

  it('refreshes the push preferences changed on another device', () => {
    expect(keysForUserChange('notification_preference', userId)).toEqual([
      ['notification-preferences', userId],
    ]);
  });

  it('refreshes everything about the user for a kind it does not know', () => {
    expect(keysForUserChange('something-new', userId)).toEqual(userTopicKeys(userId));
  });
});
