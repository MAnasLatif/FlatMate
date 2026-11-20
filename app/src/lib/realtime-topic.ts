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

/**
 * The client keeps one channel per topic and hands back the existing one,
 * even while it is still leaving. So every listener of a topic shares one
 * channel, which is left only when the last listener stops, and a new
 * channel is not made until the old one has finished leaving. Two copies of
 * an apartment's screens can be open at once, such as its settings opened
 * from the apartment list over the apartment itself.
 */
type Listening = {
  listeners: Set<TopicHandlers>;
  channel: RealtimeChannel | null;
  // On the first join, only data loaded before listening started can have
  // missed an event. After a drop, everything loaded so far can have.
  missedBefore: number;
};

const listening = new Map<string, Listening>();
const leaving = new Map<string, Promise<unknown>>();

async function join(topic: string, current: Listening): Promise<void> {
  try {
    await leaving.get(topic);
    await supabase.realtime.setAuth();
  } catch {
    // Screens still refresh on opening, on reconnect and on returning to the app.
    console.warn('Could not start listening for changes.');
    return;
  }
  if (listening.get(topic) !== current) return;

  current.channel = supabase
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'change' }, (message) => {
      const kind = changeKindOf(message.payload);
      current.listeners.forEach((listener) => listener.onChange(kind));
    })
    .subscribe((status) => {
      if (listening.get(topic) !== current) return;
      if (status === 'SUBSCRIBED') {
        current.listeners.forEach((listener) => listener.onCatchUp(current.missedBefore));
      } else {
        // CHANNEL_ERROR, TIMED_OUT or CLOSED: the client rejoins by itself.
        current.missedBefore = Number.POSITIVE_INFINITY;
      }
    });
}

function leave(topic: string, channel: RealtimeChannel): void {
  const done: Promise<unknown> = supabase.removeChannel(channel).finally(() => {
    if (leaving.get(topic) === done) leaving.delete(topic);
  });
  leaving.set(topic, done);
}

/** Listens to a private topic and calls the handlers. Returns a function that stops listening. */
export function subscribeToTopic(topic: string, handlers: TopicHandlers): () => void {
  let current = listening.get(topic);
  if (!current) {
    current = { listeners: new Set(), channel: null, missedBefore: Date.now() };
    listening.set(topic, current);
    void join(topic, current);
  }
  current.listeners.add(handlers);

  const subscription = current;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscription.listeners.delete(handlers);
    if (subscription.listeners.size > 0) return;
    listening.delete(topic);
    if (subscription.channel) leave(topic, subscription.channel);
  };
}
