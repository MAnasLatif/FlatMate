import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test/render';

import { createReceiptUrl, fetchAttachments } from '../api';
import { ExpenseReceipts, ReceiptView } from '../components/expense-receipts';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchAttachments: jest.fn(),
  createReceiptUrl: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PATH = `${APARTMENT}/${EXPENSE}/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg`;

const attachments = jest.mocked(fetchAttachments);
const receiptUrl = jest.mocked(createReceiptUrl);

beforeEach(() => {
  jest.clearAllMocks();
  receiptUrl.mockResolvedValue('https://storage.example/signed/receipt.jpg');
});

describe('ExpenseReceipts', () => {
  it('says when an expense has no receipt', async () => {
    attachments.mockResolvedValue([]);
    await renderWithProviders(<ExpenseReceipts apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByText('No receipt attached.')).toBeOnTheScreen();
  });

  it('opens a receipt in the viewer', async () => {
    attachments.mockResolvedValue([
      { id: '1', storage_path: PATH, created_at: '2026-11-13T09:00:00Z' },
    ]);
    await renderWithProviders(<ExpenseReceipts apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Open receipt 1' }));

    expect(receiptUrl).toHaveBeenCalledWith(PATH);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/receipt',
      params: { apartmentId: APARTMENT, path: PATH },
    });
  });

  it('offers a retry when the receipts cannot be loaded', async () => {
    attachments.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    await renderWithProviders(<ExpenseReceipts apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    expect(await screen.findByText('Could not load the receipts.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No receipt attached.')).toBeOnTheScreen();
  });
});

describe('ReceiptView', () => {
  it('shows the receipt through a signed link', async () => {
    await renderWithProviders(<ReceiptView path={PATH} />);

    expect(await screen.findByLabelText('Receipt photo')).toBeOnTheScreen();
    expect(receiptUrl).toHaveBeenCalledWith(PATH);
  });

  it('explains when the link cannot be created, without the server message', async () => {
    receiptUrl.mockRejectedValue({ status: 400, statusCode: '404', message: 'Object not found' });
    await renderWithProviders(<ReceiptView path={PATH} />);

    expect(await screen.findByText('Could not show the receipt.')).toBeOnTheScreen();
    expect(screen.queryByText('Object not found')).not.toBeOnTheScreen();
  });
});
