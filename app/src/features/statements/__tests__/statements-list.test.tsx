import { screen, userEvent } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { fetchStatementPeriods } from '../api';
import { StatementsList } from '../components/statements-list';
import { exportPdf } from '../export';

const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchStatementPeriods: jest.fn(),
}));
jest.mock('../export', () => ({ exportPdf: jest.fn() }));

const apartment: Apartment = {
  id: 'flat',
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: ME,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

function me(role: Member['role']): Member {
  return {
    membershipId: 'm-1',
    userId: ME,
    role,
    canAddExpense: true,
    joinedAt: '2026-10-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    hiddenAt: null,
    displayName: 'Anas',
    avatarPath: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([me('member')]);
  jest.mocked(fetchStatementPeriods).mockResolvedValue([
    { id: 'p2', starts_on: '2026-11-01', ends_on: '2026-11-30', state: 'open' },
    { id: 'p1', starts_on: '2026-10-01', ends_on: '2026-10-31', state: 'closed' },
  ]);
  jest.mocked(exportPdf).mockResolvedValue();
});

it('lists the periods, newest first, saying which are final', async () => {
  await renderWithProviders(<StatementsList apartmentId="flat" />);

  expect(await screen.findByText('Open: figures so far, which can still change')).toBeOnTheScreen();
  expect(screen.getByText('Closed: final figures')).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: /^My statement/ })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /^Apartment report/ })).not.toBeOnTheScreen();
});

it('makes the statement of the period pressed', async () => {
  await renderWithProviders(<StatementsList apartmentId="flat" />);

  const [, closed] = await screen.findAllByRole('button', { name: /^My statement/ });
  await userEvent.setup().press(closed);

  expect(exportPdf).toHaveBeenCalledWith({
    kind: 'statement',
    apartmentId: 'flat',
    apartmentName: 'Flat 4B',
    currency: 'PKR',
    periodId: 'p1',
    userId: ME,
  });
});

it('offers admins the apartment report', async () => {
  jest.mocked(fetchMembers).mockResolvedValue([me('admin')]);
  await renderWithProviders(<StatementsList apartmentId="flat" />);

  const [current] = await screen.findAllByRole('button', { name: /^Apartment report/ });
  await userEvent.setup().press(current);

  expect(exportPdf).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'report', periodId: 'p2' }),
  );
});

it('says why a PDF could not be made', async () => {
  jest.mocked(exportPdf).mockRejectedValue(new Error('sharing_unavailable'));
  await renderWithProviders(<StatementsList apartmentId="flat" />);

  const [current] = await screen.findAllByRole('button', { name: /^My statement/ });
  await userEvent.setup().press(current);

  expect(
    await screen.findByText('This device cannot share files, so the PDF cannot be opened here.'),
  ).toBeOnTheScreen();
});

it('offers a retry when the periods cannot be loaded', async () => {
  jest.mocked(fetchStatementPeriods).mockRejectedValue(new Error('boom'));
  await renderWithProviders(<StatementsList apartmentId="flat" />);

  expect(await screen.findByText('Could not load the statements.')).toBeOnTheScreen();
});
