import { toRpcParticipants } from '@/features/expenses/api';
import type { SplitMethod, SplitParticipant } from '@/features/expenses/split';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

import type { ValidBill, ValidRecurring } from './draft';

export type RecurringKind = 'fixed' | 'variable';
export type IntervalMonths = 1 | 3 | 12;

/** A repeatable expense as admins manage it (SRS FR-04). Only admins can read these. */
export type RecurringTemplate = {
  id: string;
  title: string;
  kind: RecurringKind;
  /** Fixed templates only. */
  amountMinor: number | null;
  intervalMonths: IntervalMonths;
  /** 1 to 31; 29 to 31 fall on the last day of shorter months. */
  billDay: number;
  /** The charge is due this many days after the bill day; null for no due date. */
  dueAfterDays: number | null;
  collectorId: string | null;
  splitMethod: SplitMethod;
  participants: SplitParticipant[];
  /** The first day of the next month to charge, as YYYY-MM-DD. */
  nextPeriod: string;
  isPaused: boolean;
};

/** One period of a template that waits for an admin. */
export type WaitingBill = {
  id: string;
  /** The day the bill arrived, as YYYY-MM-DD. */
  billDate: string;
  /** A variable bill needs its amount; a fixed one names someone who has left. */
  reason: 'amount_needed' | 'split_needs_review';
  template: RecurringTemplate;
};

const TEMPLATE_COLUMNS =
  'id, title, kind, amount_minor, interval_months, bill_day, due_after_days, collector_id, split_method, participants, next_period, paused_at';

type TemplateRow = {
  id: string;
  title: string;
  kind: string;
  amount_minor: number | null;
  interval_months: number;
  bill_day: number;
  due_after_days: number | null;
  collector_id: string | null;
  split_method: string;
  participants: Json;
  next_period: string;
  paused_at: string | null;
};

function toTemplate(row: TemplateRow): RecurringTemplate {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as RecurringKind,
    amountMinor: row.amount_minor,
    intervalMonths: row.interval_months as IntervalMonths,
    billDay: row.bill_day,
    dueAfterDays: row.due_after_days,
    collectorId: row.collector_id,
    splitMethod: row.split_method as SplitMethod,
    participants: fromRpcParticipants(row.participants),
    nextPeriod: row.next_period,
    isPaused: row.paused_at !== null,
  };
}

/** The participants the database stores, back in the app's shape. */
export function fromRpcParticipants(value: Json): SplitParticipant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    const userId = item.user_id;
    if (typeof userId !== 'string') return [];
    const participant: SplitParticipant = { userId };
    if (typeof item.basis_points === 'number') participant.basisPoints = item.basis_points;
    if (typeof item.amount_minor === 'number') participant.amountMinor = item.amount_minor;
    return [participant];
  });
}

/** The apartment's templates that are not archived, oldest first. */
export async function fetchTemplates(apartmentId: string): Promise<RecurringTemplate[]> {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('apartment_id', apartmentId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(toTemplate);
}

/** Bills waiting for an admin, oldest first. Their template may since be archived. */
export async function fetchWaitingBills(apartmentId: string): Promise<WaitingBill[]> {
  const { data, error } = await supabase
    .from('recurring_instances')
    .select(`id, bill_date, reason, template:recurring_templates!inner(${TEMPLATE_COLUMNS})`)
    .eq('apartment_id', apartmentId)
    .eq('state', 'waiting')
    .order('bill_date', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    billDate: row.bill_date,
    reason: row.reason === 'split_needs_review' ? 'split_needs_review' : 'amount_needed',
    template: toTemplate(row.template),
  }));
}

export async function createTemplate(
  apartmentId: string,
  input: ValidRecurring,
  firstPeriod: string,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_recurring_template', {
    p_apartment_id: apartmentId,
    p_title: input.title,
    p_kind: input.kind,
    // The generated types say number; a variable bill sends no amount.
    p_amount_minor: input.amountMinor as number,
    p_interval_months: input.intervalMonths,
    p_bill_day: input.billDay,
    p_due_after_days: input.dueAfterDays as number,
    p_split_method: input.splitMethod,
    p_participants: toRpcParticipants(input.participants),
    p_collector_id: input.collectorId ?? undefined,
    p_first_period: firstPeriod,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function updateTemplate(templateId: string, input: ValidRecurring): Promise<void> {
  const { error } = await supabase.rpc('update_recurring_template', {
    p_template_id: templateId,
    p_title: input.title,
    p_amount_minor: input.amountMinor as number,
    p_interval_months: input.intervalMonths,
    p_bill_day: input.billDay,
    p_due_after_days: input.dueAfterDays as number,
    p_split_method: input.splitMethod,
    p_participants: toRpcParticipants(input.participants),
    p_collector_id: input.collectorId ?? undefined,
  });
  if (error) throw error;
}

export async function setTemplatePaused(templateId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_recurring_template_paused', {
    p_template_id: templateId,
    p_paused: paused,
  });
  if (error) throw error;
}

export async function archiveTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_recurring_template', { p_template_id: templateId });
  if (error) throw error;
}

/** Adds a waiting bill as a charge and returns the expense. Retrying returns the same one. */
export async function postBill(instanceId: string, bill: ValidBill): Promise<string> {
  const { data, error } = await supabase.rpc('post_recurring_bill', {
    p_instance_id: instanceId,
    p_amount_minor: bill.amountMinor,
    p_split_method: bill.splitMethod,
    p_participants: toRpcParticipants(bill.participants),
    p_due_date: bill.dueDate ?? undefined,
    p_collector_id: bill.collectorId ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function skipBill(instanceId: string): Promise<void> {
  const { error } = await supabase.rpc('skip_recurring_bill', { p_instance_id: instanceId });
  if (error) throw error;
}
