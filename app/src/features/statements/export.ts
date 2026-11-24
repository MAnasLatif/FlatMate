import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { fetchDisplayNames } from '@/features/profile/api';
import { formatDateTime } from '@/lib/time';

import { fetchApartmentReport, fetchMyStatement } from './api';
import { reportHtml, statementHtml } from './document';

/** A4 at 72 points per inch. */
const A4 = { width: 595, height: 842 };

export type ExportRequest = {
  kind: 'statement' | 'report';
  apartmentId: string;
  apartmentName: string;
  currency: string;
  periodId: string;
  userId: string;
};

/**
 * Makes the PDF on the phone from fresh figures and opens the share sheet,
 * where the user saves or sends it. Nothing is uploaded: the file stays in
 * the app's cache until the system clears it.
 */
export async function exportPdf(request: ExportRequest): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing_unavailable');
  }

  const document =
    request.kind === 'statement'
      ? await fetchMyStatement(request.apartmentId, request.periodId)
      : await fetchApartmentReport(request.apartmentId, request.periodId);

  const personIds =
    'people' in document
      ? [
          ...document.people.map((person) => person.person_id),
          ...document.payments.map((payment) => payment.person_id),
        ]
      : document.members.map((member) => member.person_id);
  const names = await fetchDisplayNames([...new Set([...personIds, request.userId])]);
  const nameOf = (id: string) => (id === request.userId ? 'You' : (names[id] ?? 'A former member'));
  const context = {
    apartmentName: request.apartmentName,
    currency: request.currency,
    nameOf,
    generatedAt: formatDateTime(new Date()),
  };

  const html =
    'people' in document
      ? statementHtml(document, names[request.userId] ?? 'You', context)
      : reportHtml(document, context);

  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: request.kind === 'statement' ? 'Your statement' : 'Apartment report',
  });
}
