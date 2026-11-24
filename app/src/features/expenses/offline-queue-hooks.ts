import {
  onlineManager,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { fetchMembers } from '@/features/apartments/api';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { readQueue, updateQueue } from '@/lib/offline-queue';

import { postExpense } from './api';
import { expenseKeys } from './hooks';
import {
  markFailed,
  type QueuedExpense,
  sendQueuedExpense,
  toQueuedExpense,
  upsertQueued,
} from './offline-queue';

export const offlineQueueKeys = {
  /** Never saved with the query cache: the queue has its own encrypted store. */
  mine: (userId: string) => ['offline-queue', userId] as const,
};

async function readQueuedExpenses(userId: string): Promise<QueuedExpense[]> {
  return (await readQueue(userId))
    .map(toQueuedExpense)
    .filter((expense): expense is QueuedExpense => expense !== null);
}

/** Expenses waiting on this phone to be sent in one apartment, oldest first. Works offline. */
export function useQueuedExpenses(apartmentId: string) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: offlineQueueKeys.mine(userId),
    queryFn: () => readQueuedExpenses(userId),
    select: (expenses) =>
      expenses
        .filter((expense) => expense.apartmentId === apartmentId)
        .sort((a, b) => a.savedAt.localeCompare(b.savedAt)),
    networkMode: 'always',
    staleTime: Infinity,
  });
}

function useRefreshQueue() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: offlineQueueKeys.mine(userId) });
}

/** Keeps an expense on the phone to send when back online, replacing one with its id. */
export function useQueueExpense() {
  const userId = useCurrentUserId();
  const refresh = useRefreshQueue();
  return useMutation({
    mutationFn: (expense: QueuedExpense) =>
      updateQueue(userId, (entries) => upsertQueued(entries, expense)),
    onSettled: refresh,
  });
}

/** Takes an expense off the queue: deleted by the user, or added another way. */
export function useRemoveQueuedExpense() {
  const userId = useCurrentUserId();
  const refresh = useRefreshQueue();
  return useMutation({
    mutationFn: (id: string) =>
      updateQueue(userId, (entries) => entries.filter((entry) => entry.id !== id)),
    onSettled: refresh,
  });
}

/**
 * Sends the queue, oldest first, until it is empty or the server cannot be
 * reached. One turned down is kept with its reason for the user to fix, and
 * the rest still go.
 */
async function sendQueue(userId: string, queryClient: QueryClient): Promise<void> {
  const expenses = await readQueuedExpenses(userId);
  try {
    for (const expense of expenses) {
      if (expense.failure !== null) continue;
      const outcome = await sendQueuedExpense(expense, { fetchMembers, postExpense });
      if (outcome.kind === 'waiting') return;
      if (outcome.kind === 'sent') {
        await updateQueue(userId, (entries) => entries.filter((entry) => entry.id !== expense.id));
        void queryClient.invalidateQueries({
          queryKey: expenseKeys.apartment(expense.apartmentId),
        });
      } else {
        await updateQueue(userId, (entries) => markFailed(entries, expense.id, outcome.reason));
      }
    }
  } finally {
    void queryClient.invalidateQueries({ queryKey: offlineQueueKeys.mine(userId) });
  }
}

/**
 * Sends expenses saved offline by themselves (SRS FR-10.7): when the app
 * starts online and whenever the connection comes back. Mount once while
 * signed in. Runs never overlap; a reconnect during a run starts another
 * once it ends. Each is sent with its own id as the request id, so sending
 * one twice still adds it once.
 */
export function useSendQueuedExpenses(userId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let running = false;
    let again = false;
    let active = true;
    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await sendQueue(userId, queryClient);
        } while (again && active);
      } catch {
        console.warn('Expenses saved offline could not be sent; they wait for the next try.');
      } finally {
        running = false;
      }
    };
    if (onlineManager.isOnline()) void run();
    const unsubscribe = onlineManager.subscribe((isOnline) => {
      if (isOnline) void run();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, queryClient]);
}
