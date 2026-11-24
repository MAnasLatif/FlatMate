import type { Deposit, DepositAction } from './api';
import { describeDepositAction } from './history';

const names: Record<string, string> = { me: 'You', y: 'Yasir', w: 'Wali' };
const nameOf = (id: string) => names[id] ?? 'Someone';

function action(
  id: string,
  kind: DepositAction['kind'],
  patch: Partial<DepositAction> = {},
): DepositAction {
  return {
    id,
    kind,
    position: 1,
    reversesActionId: null,
    deductions: [],
    receivedBy: null,
    createdBy: 'me',
    createdAt: '',
    ...patch,
  };
}

const deposit: Pick<Deposit, 'actions' | 'entries' | 'amountMinor'> = {
  amountMinor: 90_000,
  actions: [
    action('r', 'recorded'),
    action('t', 'taken_over'),
    action('f', 'refunded'),
    action('x', 'returned', { receivedBy: 'me' }),
    action('u', 'undone', { reversesActionId: 't' }),
  ],
  entries: [
    {
      actionId: 't',
      userId: 'y',
      kind: 'transfer_out',
      amountMinor: -30_000,
      counterpartyId: 'w',
      reason: null,
    },
    {
      actionId: 't',
      userId: 'w',
      kind: 'transfer_in',
      amountMinor: 30_000,
      counterpartyId: 'y',
      reason: null,
    },
    {
      actionId: 'f',
      userId: 'me',
      kind: 'refund',
      amountMinor: -25_000,
      counterpartyId: null,
      reason: null,
    },
    {
      actionId: 'f',
      userId: 'me',
      kind: 'deduction',
      amountMinor: -5_000,
      counterpartyId: null,
      reason: 'Lamp',
    },
    {
      actionId: 'x',
      userId: 'w',
      kind: 'refund',
      amountMinor: -30_000,
      counterpartyId: null,
      reason: null,
    },
  ],
};

const line = (id: string) =>
  describeDepositAction(
    deposit.actions.find((item) => item.id === id) as DepositAction,
    deposit,
    nameOf,
    'PKR',
  );

it('words each change to a deposit', () => {
  expect(line('r')).toBe('You recorded the deposit of Rs 900.00');
  expect(line('t')).toBe("Wali took over Rs 300.00 of Yasir's share");
  expect(line('f')).toBe('Your share was refunded: Rs 250.00 back, Rs 50.00 kept');
  expect(line('x')).toBe('The deposit was returned to you: Rs 300.00 back');
  expect(line('u')).toBe("You undid a change: Wali took over Rs 300.00 of Yasir's share");
});
