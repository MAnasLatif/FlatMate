import type { Href } from 'expo-router';

import type { NotificationTarget } from './api';
import { MEMBER_ADMIN_TYPES } from './unread';

/**
 * The screen a notification opens. That screen loads its record through the
 * usual access checks, so a record the user may no longer see shows as not
 * available there (FR-09.3).
 */
export function notificationHref(
  item: Pick<NotificationTarget, 'recordType' | 'recordId' | 'apartmentId'> &
    Partial<Pick<NotificationTarget, 'type'>>,
): Href {
  const apartmentId = item.apartmentId;
  const id = item.recordId;
  switch (item.recordType) {
    case 'expense':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
          params: { apartmentId, expenseId: id },
        };
      break;
    case 'dispute':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
          params: { apartmentId, disputeId: id },
        };
      break;
    case 'payment':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/payments/[paymentId]',
          params: { apartmentId, paymentId: id },
        };
      break;
    case 'ledger':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/ledger/[memberId]',
          params: { apartmentId, memberId: id },
        };
      break;
    case 'members':
      // An admin answers requests to join, and sees declined invitations, in the settings.
      if (item.type !== undefined && MEMBER_ADMIN_TYPES.includes(item.type)) {
        return {
          pathname: '/apartments/[apartmentId]/settings',
          params: { apartmentId, tab: 'members' },
        };
      }
      return { pathname: '/apartments/[apartmentId]/members', params: { apartmentId } };
    case 'settlement':
      return { pathname: '/apartments/[apartmentId]/settlement', params: { apartmentId } };
    case 'apartment':
      break;
    case 'deposit':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/deposits/[depositId]',
          params: { apartmentId, depositId: id },
        };
      break;
    // A repeatable bill waiting for an admin, in the apartment's settings.
    case 'recurring':
      return {
        pathname: '/apartments/[apartmentId]/settings',
        params: { apartmentId, tab: 'recurring' },
      };
    // A declined request: the apartment is not open to them, so go home.
    case 'join_request':
      return '/';
    // An invitation back is answered in the user's list of apartments.
    case 'rejoin_invite':
      return '/apartments';
  }
  return { pathname: '/apartments/[apartmentId]', params: { apartmentId } };
}
