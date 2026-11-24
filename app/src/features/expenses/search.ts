import { parseAmountToMinorUnits } from '@/lib/money';

/**
 * Filters for an apartment's expenses within the month shown (FR-10.1). The
 * server applies them (`search_expenses`), so they find expenses on pages
 * the app has not loaded. Null leaves a filter off.
 */
export type ExpenseSearch = {
  /** Words in the title, what an Other expense was, or the notes. */
  query: string;
  /** Expenses this member shares in or paid for. */
  memberId: string | null;
  categoryId: string | null;
  status: ExpenseStatusFilter | null;
  minMinor: number | null;
  maxMinor: number | null;
};

export const EXPENSE_STATUS_FILTERS = [
  { value: 'provisional', label: 'Provisional' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'final', label: 'Final' },
  { value: 'unpaid', label: 'Not paid yet' },
  { value: 'void', label: 'Cancelled' },
] as const;

export type ExpenseStatusFilter = (typeof EXPENSE_STATUS_FILTERS)[number]['value'];

export const NO_SEARCH: ExpenseSearch = {
  query: '',
  memberId: null,
  categoryId: null,
  status: null,
  minMinor: null,
  maxMinor: null,
};

/** The longest search the server accepts. */
export const MAX_QUERY_LENGTH = 100;

export function activeFilterCount(search: ExpenseSearch): number {
  return [
    search.query.trim() !== '',
    search.memberId !== null,
    search.categoryId !== null,
    search.status !== null,
    search.minMinor !== null || search.maxMinor !== null,
  ].filter(Boolean).length;
}

/** The amount range as the filter sheet's fields hold it, typed by the user. */
export type AmountDraft = { min: string; max: string };

export type AmountRange =
  { ok: true; minMinor: number | null; maxMinor: number | null } | { ok: false; error: string };

/**
 * Reads the typed amount range as minor units. An empty field leaves that end
 * open. Errors say how to fix the entry.
 */
export function parseAmountRange(draft: AmountDraft, minorUnitDigits = 2): AmountRange {
  const read = (text: string) =>
    text.trim() === '' ? null : parseAmountToMinorUnits(text, minorUnitDigits);
  const minMinor = read(draft.min);
  const maxMinor = read(draft.max);
  if (
    (draft.min.trim() !== '' && minMinor === null) ||
    (draft.max.trim() !== '' && maxMinor === null)
  ) {
    return { ok: false, error: 'Enter amounts as numbers, such as 1500 or 1500.50.' };
  }
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
    return { ok: false, error: 'The lowest amount must not be more than the highest.' };
  }
  return { ok: true, minMinor, maxMinor };
}

/** The `search_expenses` arguments for a search; filters that are off are left out. */
export function searchArguments(search: ExpenseSearch) {
  const query = search.query.trim();
  return {
    p_member_id: search.memberId ?? undefined,
    p_category_id: search.categoryId ?? undefined,
    p_status: search.status ?? undefined,
    p_min_minor: search.minMinor ?? undefined,
    p_max_minor: search.maxMinor ?? undefined,
    p_query: query === '' ? undefined : query.slice(0, MAX_QUERY_LENGTH),
  };
}
