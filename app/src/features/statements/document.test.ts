import type { ApartmentReport, Statement } from './api';
import { escapeHtml, reportHtml, statementHtml } from './document';

const names: Record<string, string> = { me: 'You', anas: 'Anas', ajmal: 'Ajmal <b>' };
const context = {
  apartmentName: 'Flat "4B" & co',
  currency: 'PKR',
  nameOf: (id: string) => names[id] ?? 'A former member',
  generatedAt: '24 Nov 2026',
};

const statement: Statement = {
  period: { id: 'p2', starts_on: '2026-11-01', ends_on: '2026-11-30', state: 'open' },
  expenses: [
    {
      date: '2026-11-03',
      title: 'Groceries <script>',
      amount_minor: 30_000,
      status: 'provisional',
      paid_status: 'paid',
      share_minor: 15_000,
      paid_minor: 0,
    },
    {
      date: '2026-11-05',
      title: 'Internet',
      amount_minor: 20_000,
      status: 'final',
      paid_status: 'unpaid',
      share_minor: 10_000,
      paid_minor: 20_000,
    },
  ],
  payments: [
    {
      date: '2026-11-04',
      direction: 'sent',
      person_id: 'anas',
      amount_minor: 5_000,
      status: 'provisional',
    },
    {
      date: '2026-11-06',
      direction: 'received',
      person_id: 'ajmal',
      amount_minor: 2_500,
      status: 'final',
    },
  ],
  people: [
    {
      person_id: 'anas',
      opening_minor: 15_000,
      opening_disputed_minor: 0,
      closing_minor: 10_000,
      closing_disputed_minor: 4_000,
    },
    {
      person_id: 'ajmal',
      opening_minor: 0,
      opening_disputed_minor: 0,
      closing_minor: -7_500,
      closing_disputed_minor: 0,
    },
  ],
};

describe('statementHtml', () => {
  const html = statementHtml(statement, 'Zubair', context);

  it('sums the share, what was paid, payments, payables, receivables and disputes (AC-14)', () => {
    expect(html).toContain('<td>Your share of expenses</td><td class="num">Rs 250.00</td>');
    expect(html).toContain('<td>You paid for expenses</td><td class="num">Rs 200.00</td>');
    expect(html).toContain('<td>Payments you sent</td><td class="num">Rs 50.00</td>');
    expect(html).toContain('<td>Payments you received</td><td class="num">Rs 25.00</td>');
    expect(html).toContain(
      '<td>Carried forward into this period</td><td class="num">You owed Rs 150.00</td>',
    );
    expect(html).toContain('<td>So far: you owe (payables)</td><td class="num">Rs 100.00</td>');
    expect(html).toContain(
      '<td>So far: you are owed (receivables)</td><td class="num">Rs 75.00</td>',
    );
    expect(html).toContain('<td>So far: held by disputes</td><td class="num">Rs 40.00</td>');
  });

  it('says who owes whom with each person', () => {
    expect(html).toContain('You owe Anas Rs 100.00');
    expect(html).toContain('Ajmal &lt;b&gt; owes you Rs 75.00');
    expect(html).toContain('You paid Anas');
  });

  it('escapes everything people typed', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('Groceries &lt;script&gt;');
    expect(html).toContain('Flat &quot;4B&quot; &amp; co');
  });

  it('marks an unpaid bill, and an open period as able to change', () => {
    expect(html).toContain('Final, not paid yet');
    expect(html).toContain('This period is still open.');
  });

  it('calls a closed period final', () => {
    const closed = statementHtml(
      { ...statement, period: { ...statement.period, state: 'closed' } },
      'Zubair',
      context,
    );
    expect(closed).toContain('This period has closed.');
    expect(closed).toContain('At close: you owe (payables)');
  });

  it('says so when there is nothing to list', () => {
    const empty = statementHtml(
      { ...statement, expenses: [], payments: [], people: [] },
      'Zubair',
      context,
    );
    expect(empty).toContain('No expenses of yours in this period.');
    expect(empty).toContain('No payments to or from you in this period.');
    expect(empty).toContain(
      '<td>Carried forward into this period</td><td class="num">Nothing</td>',
    );
  });

  it('says payments are not proof of a transfer', () => {
    expect(html).toContain('not proof of a bank transfer');
  });
});

describe('reportHtml', () => {
  const report: ApartmentReport = {
    period: { id: 'p1', starts_on: '2026-10-01', ends_on: '2026-10-31', state: 'closed' },
    total_minor: 50_000,
    open_disputes: 1,
    members: [
      {
        person_id: 'anas',
        share_minor: 25_000,
        paid_minor: 50_000,
        sent_minor: 0,
        received_minor: 5_000,
        opening_minor: 0,
        closing_minor: -20_000,
        closing_disputed_minor: -1_000,
      },
      {
        person_id: 'me',
        share_minor: 25_000,
        paid_minor: 0,
        sent_minor: 5_000,
        received_minor: 0,
        opening_minor: 0,
        closing_minor: 20_000,
        closing_disputed_minor: 1_000,
      },
    ],
  };
  const html = reportHtml(report, context);

  it('shows the totals and each member', () => {
    expect(html).toContain('<td>Spending in this period</td><td class="num">Rs 500.00</td>');
    expect(html).toContain('<td>At close: open disputes</td><td class="num">1</td>');
    expect(html).toContain('Is owed Rs 200.00');
    expect(html).toContain('Owes Rs 200.00');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that matter in HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
