import { toRpcParticipants } from '@/features/expenses/api';
import type { SplitMethod, SplitParticipant } from '@/features/expenses/split';
import { fromRpcParticipants } from '@/features/recurring/api';
import { supabase } from '@/lib/supabase';

/**
 * A quick-add template for a common expense (FR-10.3). It belongs to the
 * apartment: every member sees it, and anyone who may add expenses saves or
 * deletes it. Using one only fills in the Add expense form.
 */
export type QuickAdd = {
  id: string;
  title: string;
  /** Null when the amount differs each time. */
  amountMinor: number | null;
  categoryId: string | null;
  categoryDetail: string | null;
  splitMethod: SplitMethod;
  /** Null: shared equally by everyone who is a member when it is used. */
  participants: SplitParticipant[] | null;
};

export type QuickAddInput = Omit<QuickAdd, 'id'>;

/** The apartment's templates, by name. */
export async function fetchQuickAdds(apartmentId: string): Promise<QuickAdd[]> {
  const { data, error } = await supabase
    .from('expense_templates')
    .select('id, title, amount_minor, category_id, category_detail, split_method, participants')
    .eq('apartment_id', apartmentId)
    .order('title', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    amountMinor: row.amount_minor,
    categoryId: row.category_id,
    categoryDetail: row.category_detail,
    splitMethod: row.split_method as SplitMethod,
    participants: row.participants === null ? null : fromRpcParticipants(row.participants),
  }));
}

/** Saves a template; one with the same name, in any case, is replaced. */
export async function saveQuickAdd(apartmentId: string, input: QuickAddInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_expense_template', {
    p_apartment_id: apartmentId,
    p_title: input.title,
    p_split_method: input.splitMethod,
    p_amount_minor: input.amountMinor ?? undefined,
    p_category_id: input.categoryId ?? undefined,
    p_category_detail: input.categoryDetail ?? undefined,
    p_participants: input.participants ? toRpcParticipants(input.participants) : undefined,
  });
  if (error) throw error;
  return data;
}

export async function deleteQuickAdd(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_expense_template', { p_template_id: templateId });
  if (error) throw error;
}
