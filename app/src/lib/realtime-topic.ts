import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Listening to one change-event topic over Supabase Realtime (decision 0007).
 * Events are private Broadcast messages sent by the database. Each says only
 * which kind of record changed, so the app refetches what it shows.
 */

export type TopicHandlers = {
  /** A change happened. `kind` is null when the message did not name one. */
  onChange: (kind: string | null) => void;
  /**
   * The channel is (re)joined. Events sent while it was not joined are lost,
   * so data loaded before `before` (milliseconds since the epoch) may be stale.
   */
  onCatchUp: (before: number) => void;
};

/** The kind a change event names, or null for anything else. */
export function changeKindOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('kind' in payload)) return null;
  return typeof payload.kind === 'string' ? payload.kind : null;
}

/** Joins a private topic and calls the handlers. Returns a function that leaves it. */
export function subscribeToTopic(topic: string, handlers: TopicHandlers): () => void {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  // On the first join, only data loaded before listening started can have
  // missed an event. After a drop, everything loaded so far can have.
  let missedBefore = Date.now();

  supabase.realtime
    .setAuth()
    .then(() => {
      if (stopped) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'change' }, (message) => {
          handlers.onChange(changeKindOf(message.payload));
        })
        .subscribe((status) => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') {
            handlers.onCatchUp(missedBefore);
          } else {
            // CHANNEL_ERROR, TIMED_OUT or CLOSED: the client rejoins by itself.
            missedBefore = Number.POSITIVE_INFINITY;
          }
        });
    })
    .catch(() => {
      // Screens still refresh on opening, on reconnect and on returning to the app.
      console.warn('Could not start listening for changes.');
    });

  return () => {
    stopped = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
