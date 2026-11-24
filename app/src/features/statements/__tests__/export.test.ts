import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { fetchDisplayNames } from '@/features/profile/api';

import { fetchApartmentReport, fetchMyStatement, type Statement } from '../api';
import { exportPdf } from '../export';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('@/features/profile/api', () => ({ fetchDisplayNames: jest.fn() }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchMyStatement: jest.fn(),
  fetchApartmentReport: jest.fn(),
}));

const statement: Statement = {
  period: { id: 'p1', starts_on: '2026-11-01', ends_on: '2026-11-30', state: 'closed' },
  expenses: [],
  payments: [
    {
      date: '2026-11-02',
      direction: 'received',
      person_id: 'gone',
      amount_minor: 100,
      status: 'final',
    },
  ],
  people: [
    {
      person_id: 'anas',
      opening_minor: 0,
      opening_disputed_minor: 0,
      closing_minor: 500,
      closing_disputed_minor: 0,
    },
  ],
};

const request = {
  kind: 'statement' as const,
  apartmentId: 'flat',
  apartmentName: 'Flat 4B',
  currency: 'PKR',
  periodId: 'p1',
  userId: 'me',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest
    .mocked(Print.printToFileAsync)
    .mockResolvedValue({ uri: 'file:///cache/s.pdf', numberOfPages: 1 });
  jest.mocked(fetchMyStatement).mockResolvedValue(statement);
  jest.mocked(fetchDisplayNames).mockResolvedValue({ me: 'Zubair', anas: 'Anas' });
});

it('makes an A4 PDF of the statement with names, and opens the share sheet', async () => {
  await exportPdf(request);

  expect(fetchMyStatement).toHaveBeenCalledWith('flat', 'p1');
  expect(fetchDisplayNames).toHaveBeenCalledWith(['anas', 'gone', 'me']);
  const { html, width, height } = jest.mocked(Print.printToFileAsync).mock.calls[0][0] ?? {};
  expect([width, height]).toEqual([595, 842]);
  expect(html).toContain('Flat 4B · Zubair');
  expect(html).toContain('You owe Anas Rs 5.00');
  expect(html).toContain('A former member paid you');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/s.pdf', {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Your statement',
  });
});

it('makes the apartment report for an admin', async () => {
  jest.mocked(fetchApartmentReport).mockResolvedValue({
    period: statement.period,
    total_minor: 0,
    open_disputes: 0,
    members: [],
  });

  await exportPdf({ ...request, kind: 'report' });

  expect(fetchApartmentReport).toHaveBeenCalledWith('flat', 'p1');
  expect(jest.mocked(Print.printToFileAsync).mock.calls[0][0]?.html).toContain('Apartment report');
});

it('stops before fetching anything when the device cannot share', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

  await expect(exportPdf(request)).rejects.toThrow('sharing_unavailable');
  expect(fetchMyStatement).not.toHaveBeenCalled();
});
