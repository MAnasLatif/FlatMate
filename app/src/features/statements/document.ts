import { formatMoney } from '@/features/apartments/currencies';
import { formatDate } from '@/lib/time';

import type { ApartmentReport, Statement, StatementPeriod } from './api';

/**
 * The statement and the apartment report as HTML pages, which the phone
 * turns into PDFs (FR-10.2, AC-14). Everything typed by people (names,
 * titles, the apartment's name) is escaped. Amounts stay integers in minor
 * units until they are formatted.
 */

type Context = {
  apartmentName: string;
  currency: string;
  /** "You" for the reader, otherwise the person's name. */
  nameOf: (userId: string) => string;
  /** When the PDF was made, as shown on it. */
  generatedAt: string;
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_LABELS: Record<string, string> = {
  provisional: 'Provisional',
  disputed: 'Disputed',
  final: 'Final',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function periodLabel(period: Pick<StatementPeriod, 'starts_on' | 'ends_on'>): string {
  return `${formatDate(period.starts_on)} – ${formatDate(period.ends_on)}`;
}

function periodNote(period: StatementPeriod): string {
  return period.state === 'closed'
    ? 'This period has closed. Its figures are final and will not change.'
    : 'This period is still open. Figures are as they stand now and can change before it closes.';
}

/** A balance from the reader's side: positive, the reader owes. */
function readerBalance(amountMinor: number, name: string, currency: string): string {
  if (amountMinor === 0) return 'Square';
  const amount = formatMoney(Math.abs(amountMinor), currency);
  return amountMinor > 0
    ? `You owe ${escapeHtml(name)} ${amount}`
    : `${escapeHtml(name)} owes you ${amount}`;
}

/** A member's net balance in the report: positive, they owe. */
function memberBalance(amountMinor: number, currency: string): string {
  if (amountMinor === 0) return 'Square';
  const amount = formatMoney(Math.abs(amountMinor), currency);
  return amountMinor > 0 ? `Owes ${amount}` : `Is owed ${amount}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const STYLES = `
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 11px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; }
  .muted { color: #555; }
  .note { background: #f3f4f6; border-radius: 6px; padding: 8px 10px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { font-weight: 600; color: #374151; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .summary td:first-child { color: #374151; }
  .summary td.num { font-weight: 600; }
  footer { margin-top: 24px; color: #6b7280; font-size: 9px; }
`;

function page(title: string, body: string, context: Context): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head>
<body>${body}
<footer>Made with FlatMate on ${escapeHtml(context.generatedAt)}. Payments are recorded by flatmates and are not proof of a bank transfer. A payment marked final means nobody objected in time.</footer>
</body></html>`;
}

function summaryTable(rows: [string, string][]): string {
  return `<table class="summary">${rows
    .map(([label, value]) => `<tr><td>${label}</td><td class="num">${value}</td></tr>`)
    .join('')}</table>`;
}

/** One person's statement for a settlement period. */
export function statementHtml(statement: Statement, readerName: string, context: Context): string {
  const { currency, nameOf } = context;
  const money = (amountMinor: number) => formatMoney(amountMinor, currency);
  const share = sum(statement.expenses.map((expense) => expense.share_minor));
  const paid = sum(statement.expenses.map((expense) => expense.paid_minor));
  const sent = sum(
    statement.payments.filter((p) => p.direction === 'sent').map((p) => p.amount_minor),
  );
  const received = sum(
    statement.payments.filter((p) => p.direction === 'received').map((p) => p.amount_minor),
  );
  const carried = sum(statement.people.map((person) => person.opening_minor));
  const payables = sum(statement.people.map((p) => Math.max(p.closing_minor, 0)));
  const receivables = sum(statement.people.map((p) => Math.max(-p.closing_minor, 0)));
  const disputed = sum(statement.people.map((p) => Math.abs(p.closing_disputed_minor)));
  const closingWord = statement.period.state === 'closed' ? 'At close' : 'So far';

  const body = `
<h1>Statement</h1>
<div class="muted">${escapeHtml(context.apartmentName)} · ${escapeHtml(readerName)} · ${periodLabel(statement.period)}</div>
<div class="note">${periodNote(statement.period)}</div>

<h2>Summary</h2>
${summaryTable([
  ['Your share of expenses', money(share)],
  ['You paid for expenses', money(paid)],
  ['Payments you sent', money(sent)],
  ['Payments you received', money(received)],
  [
    'Carried forward into this period',
    carried === 0
      ? 'Nothing'
      : carried > 0
        ? `You owed ${money(carried)}`
        : `You were owed ${money(-carried)}`,
  ],
  [`${closingWord}: you owe (payables)`, money(payables)],
  [`${closingWord}: you are owed (receivables)`, money(receivables)],
  [`${closingWord}: held by disputes`, money(disputed)],
])}

<h2>With each person</h2>
${
  statement.people.length === 0
    ? '<p class="muted">You had nothing to settle with anyone.</p>'
    : `<table><tr><th>Person</th><th class="num">Carried forward</th><th class="num">${closingWord}</th><th class="num">Disputed</th></tr>${statement.people
        .map((person) => {
          const name = nameOf(person.person_id);
          return `<tr><td>${escapeHtml(name)}</td><td class="num">${readerBalance(person.opening_minor, name, currency)}</td><td class="num">${readerBalance(person.closing_minor, name, currency)}</td><td class="num">${person.closing_disputed_minor === 0 ? '—' : money(Math.abs(person.closing_disputed_minor))}</td></tr>`;
        })
        .join('')}</table>`
}

<h2>Expenses</h2>
${
  statement.expenses.length === 0
    ? '<p class="muted">No expenses of yours in this period.</p>'
    : `<table><tr><th>Date</th><th>Expense</th><th>Status</th><th class="num">Amount</th><th class="num">Your share</th><th class="num">You paid</th></tr>${statement.expenses
        .map(
          (expense) =>
            `<tr><td>${formatDate(expense.date)}</td><td>${escapeHtml(expense.title)}</td><td>${statusLabel(expense.status)}${expense.paid_status === 'unpaid' ? ', not paid yet' : ''}</td><td class="num">${money(expense.amount_minor)}</td><td class="num">${money(expense.share_minor)}</td><td class="num">${money(expense.paid_minor)}</td></tr>`,
        )
        .join('')}</table>`
}

<h2>Payments</h2>
${
  statement.payments.length === 0
    ? '<p class="muted">No payments to or from you in this period.</p>'
    : `<table><tr><th>Date</th><th>Payment</th><th>Status</th><th class="num">Amount</th></tr>${statement.payments
        .map((payment) => {
          const name = escapeHtml(nameOf(payment.person_id));
          const what = payment.direction === 'sent' ? `You paid ${name}` : `${name} paid you`;
          return `<tr><td>${formatDate(payment.date)}</td><td>${what}</td><td>${statusLabel(payment.status)}</td><td class="num">${money(payment.amount_minor)}</td></tr>`;
        })
        .join('')}</table>`
}`;
  return page(`Statement ${periodLabel(statement.period)}`, body, context);
}

/** The admins' report on an apartment for a settlement period. */
export function reportHtml(report: ApartmentReport, context: Context): string {
  const { currency, nameOf } = context;
  const money = (amountMinor: number) => formatMoney(amountMinor, currency);
  const closingWord = report.period.state === 'closed' ? 'At close' : 'So far';

  const body = `
<h1>Apartment report</h1>
<div class="muted">${escapeHtml(context.apartmentName)} · ${periodLabel(report.period)}</div>
<div class="note">${periodNote(report.period)}</div>

<h2>Summary</h2>
${summaryTable([
  ['Spending in this period', money(report.total_minor)],
  [`${closingWord}: open disputes`, String(report.open_disputes)],
  ['Members', String(report.members.length)],
])}

<h2>Members</h2>
${
  report.members.length === 0
    ? '<p class="muted">Nothing happened in this period.</p>'
    : `<table><tr><th>Member</th><th class="num">Share</th><th class="num">Paid</th><th class="num">Sent</th><th class="num">Received</th><th class="num">Carried forward</th><th class="num">${closingWord}</th><th class="num">Disputed</th></tr>${report.members
        .map(
          (member) =>
            `<tr><td>${escapeHtml(nameOf(member.person_id))}</td><td class="num">${money(member.share_minor)}</td><td class="num">${money(member.paid_minor)}</td><td class="num">${money(member.sent_minor)}</td><td class="num">${money(member.received_minor)}</td><td class="num">${memberBalance(member.opening_minor, currency)}</td><td class="num">${memberBalance(member.closing_minor, currency)}</td><td class="num">${member.closing_disputed_minor === 0 ? '—' : money(Math.abs(member.closing_disputed_minor))}</td></tr>`,
        )
        .join('')}</table>`
}
<p class="muted">Share and Paid cover the period's expenses. Sent and Received are payments recorded in it. Balances are net across each member's flatmates: Owes means they owe more than they are owed.</p>`;
  return page(`Apartment report ${periodLabel(report.period)}`, body, context);
}
