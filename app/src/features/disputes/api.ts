import { imagePath, type PickedImage, uploadPrivateImage } from '@/lib/private-images';
import { supabase } from '@/lib/supabase';
import type { Json, Tables } from '@/types/database';

export type DisputeKind = 'decline' | 'adjustment';
export type DisputeState = 'open' | 'escalated' | 'resolved';
export type DisputeResolution = 'adjusted' | 'upheld' | 'withdrawn';

/** A member's objection to an expense (decision record 0004). */
export type Dispute = {
  id: string;
  apartmentId: string;
  expenseId: string;
  /** The revision that was objected to. */
  expenseRevision: number;
  kind: DisputeKind;
  raisedBy: string;
  reason: string;
  /** The share the raiser proposes for themselves. Zero for a decline. */
  proposedShareMinor: number;
  /** Raised after the objection window closed: an adjustment case that holds nothing. */
  isLate: boolean;
  state: DisputeState;
  resolution: DisputeResolution | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type DisputeEvent = {
  id: number;
  actorId: string;
  action: 'raised' | 'accepted' | 'rejected' | 'withdrawn' | 'upheld' | 'adjusted';
  message: string | null;
  details: Json;
  createdAt: string;
};

export type DisputeEvidence = {
  id: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
};

export type DisputeDetail = {
  dispute: Dispute;
  events: DisputeEvent[];
  evidence: DisputeEvidence[];
};

const DISPUTE_COLUMNS =
  'id, apartment_id, expense_id, expense_revision, kind, raised_by, reason, proposed_share_minor, is_late, state, resolution, resolved_by, resolved_at, created_at';

type DisputeRow = Pick<
  Tables<'disputes'>,
  | 'id'
  | 'apartment_id'
  | 'expense_id'
  | 'expense_revision'
  | 'kind'
  | 'raised_by'
  | 'reason'
  | 'proposed_share_minor'
  | 'is_late'
  | 'state'
  | 'resolution'
  | 'resolved_by'
  | 'resolved_at'
  | 'created_at'
>;

function toDispute(row: DisputeRow): Dispute {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    // Every dispute so far is about an expense (disputes_expense_subject).
    expenseId: row.expense_id as string,
    expenseRevision: row.expense_revision as number,
    kind: row.kind as DisputeKind,
    raisedBy: row.raised_by,
    reason: row.reason,
    proposedShareMinor: row.proposed_share_minor,
    isLate: row.is_late,
    state: row.state as DisputeState,
    resolution: row.resolution as DisputeResolution | null,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/** An expense's disputes, newest first. There are few per expense, so they are not paged. */
export async function fetchExpenseDisputes(expenseId: string): Promise<Dispute[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toDispute);
}

/** A dispute with its history and evidence, or null when the user cannot see it. */
export async function fetchDisputeDetail(disputeId: string): Promise<DisputeDetail | null> {
  const [disputeResult, eventsResult, evidenceResult] = await Promise.all([
    supabase.from('disputes').select(DISPUTE_COLUMNS).eq('id', disputeId).maybeSingle(),
    supabase
      .from('dispute_events')
      .select('id, actor_id, action, message, details, created_at')
      .eq('dispute_id', disputeId)
      .order('id', { ascending: true }),
    supabase
      .from('dispute_attachments')
      .select('id, storage_path, uploaded_by, created_at')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true }),
  ]);
  if (disputeResult.error) throw disputeResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (evidenceResult.error) throw evidenceResult.error;
  if (!disputeResult.data) return null;

  return {
    dispute: toDispute(disputeResult.data),
    events: eventsResult.data.map((event) => ({
      id: event.id,
      actorId: event.actor_id,
      action: event.action as DisputeEvent['action'],
      message: event.message,
      details: event.details,
      createdAt: event.created_at,
    })),
    evidence: evidenceResult.data.map((item) => ({
      id: item.id,
      storagePath: item.storage_path,
      uploadedBy: item.uploaded_by,
      createdAt: item.created_at,
    })),
  };
}

export type RaiseDisputeInput = {
  expenseId: string;
  kind: DisputeKind;
  reason: string;
  /** The raiser's proposed share; ignored for a decline. */
  proposedShareMinor: number | null;
  /** One id per dispute being raised, so a retried save cannot raise two. */
  requestId: string;
};

export async function raiseDispute(input: RaiseDisputeInput): Promise<string> {
  const { data, error } = await supabase.rpc('raise_dispute', {
    p_expense_id: input.expenseId,
    p_kind: input.kind,
    p_reason: input.reason,
    p_proposed_share_minor: input.proposedShareMinor ?? undefined,
    p_client_request_id: input.requestId,
  });
  if (error) throw error;
  return data;
}

/** The expense's creator accepts the proposal or rejects it with a message. */
export async function respondToDispute(
  disputeId: string,
  accept: boolean,
  message: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('respond_to_dispute', {
    p_dispute_id: disputeId,
    p_accept: accept,
    p_message: message ?? undefined,
  });
  if (error) throw error;
}

export async function withdrawDispute(disputeId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_dispute', { p_dispute_id: disputeId });
  if (error) throw error;
}

/** An admin applies the proposal or upholds the expense, with a message. */
export async function decideDispute(
  disputeId: string,
  apply: boolean,
  message: string,
): Promise<void> {
  const { error } = await supabase.rpc('decide_dispute', {
    p_dispute_id: disputeId,
    p_apply: apply,
    p_message: message,
  });
  if (error) throw error;
}

/**
 * Uploads a photo under the dispute's folder and registers it as evidence.
 * Safe to retry, like receipts.
 */
export async function addEvidence(
  apartmentId: string,
  disputeId: string,
  image: PickedImage,
): Promise<void> {
  const path = imagePath(`${apartmentId}/${disputeId}`, image);
  await uploadPrivateImage('dispute-evidence', path, image);
  const { error } = await supabase.rpc('add_dispute_evidence', {
    p_dispute_id: disputeId,
    p_storage_path: path,
  });
  if (error) throw error;
}
