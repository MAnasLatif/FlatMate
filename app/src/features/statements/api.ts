import { z } from 'zod';

import { supabase } from '@/lib/supabase';

/**
 * Statements and apartment reports for one settlement period (FR-10.2,
 * AC-14). The server works out the figures; the app lays them out and makes
 * the PDF. Responses are checked here, since the shape is not typed by the
 * generated database types (it is JSON).
 */

const amount = z.number().int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const periodSchema = z.object({
  id: z.string(),
  starts_on: isoDate,
  ends_on: isoDate,
  state: z.enum(['open', 'closed']),
});

const statementSchema = z.object({
  period: periodSchema,
  expenses: z.array(
    z.object({
      date: isoDate,
      title: z.string(),
      amount_minor: amount,
      status: z.string(),
      paid_status: z.string(),
      share_minor: amount,
      paid_minor: amount,
    }),
  ),
  payments: z.array(
    z.object({
      date: isoDate,
      direction: z.enum(['sent', 'received']),
      person_id: z.string(),
      amount_minor: amount,
      status: z.string(),
    }),
  ),
  people: z.array(
    z.object({
      person_id: z.string(),
      opening_minor: amount,
      opening_disputed_minor: amount,
      closing_minor: amount,
      closing_disputed_minor: amount,
    }),
  ),
});

const reportSchema = z.object({
  period: periodSchema,
  total_minor: amount,
  open_disputes: z.number().int(),
  members: z.array(
    z.object({
      person_id: z.string(),
      share_minor: amount,
      paid_minor: amount,
      sent_minor: amount,
      received_minor: amount,
      opening_minor: amount,
      closing_minor: amount,
      closing_disputed_minor: amount,
    }),
  ),
});

export type StatementPeriod = z.infer<typeof periodSchema>;
export type Statement = z.infer<typeof statementSchema>;
export type ApartmentReport = z.infer<typeof reportSchema>;

/** How many periods the statements screen lists, newest first. */
export const PERIODS_SHOWN = 24;

export async function fetchStatementPeriods(apartmentId: string): Promise<StatementPeriod[]> {
  const { data, error } = await supabase
    .from('settlement_periods')
    .select('id, starts_on, ends_on, state')
    .eq('apartment_id', apartmentId)
    .order('starts_on', { ascending: false })
    .limit(PERIODS_SHOWN);
  if (error) throw error;
  return z.array(periodSchema).parse(data);
}

export async function fetchMyStatement(apartmentId: string, periodId: string): Promise<Statement> {
  const { data, error } = await supabase.rpc('get_my_statement', {
    p_apartment_id: apartmentId,
    p_period_id: periodId,
  });
  if (error) throw error;
  return statementSchema.parse(data);
}

export async function fetchApartmentReport(
  apartmentId: string,
  periodId: string,
): Promise<ApartmentReport> {
  const { data, error } = await supabase.rpc('get_apartment_report', {
    p_apartment_id: apartmentId,
    p_period_id: periodId,
  });
  if (error) throw error;
  return reportSchema.parse(data);
}
