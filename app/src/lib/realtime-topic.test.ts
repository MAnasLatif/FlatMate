import { supabase } from './supabase';
import { changeKindOf, subscribeToTopic } from './realtime-topic';

type StatusCallback = (status: string) => void;
type MessageCallback = (message: { payload: unknown }) => void;

const mockChannel = {
  on: jest.fn(),
  subscribe: jest.fn(),
};
let onMessage: MessageCallback | undefined;
let onStatus: StatusCallback | undefined;

jest.mock('./supabase', () => ({
  supabase: {
    realtime: { setAuth: jest.fn(() => Promise.resolve()) },
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(() => Promise.resolve('ok')),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockChannel.on.mockImplementation(
    (_type: string, _filter: unknown, callback: MessageCallback) => {
      onMessage = callback;
      return mockChannel;
    },
  );
  mockChannel.subscribe.mockImplementation((callback: StatusCallback) => {
    onStatus = callback;
    return mockChannel;
  });
});

/** Lets the auth promise settle so the channel is created. */
const settle = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('subscribeToTopic', () => {
  it('joins the topic as a private channel and listens for change events', async () => {
    subscribeToTopic('apartment:a', { onChange: jest.fn(), onCatchUp: jest.fn() });
    await settle();
    expect(supabase.realtime.setAuth).toHaveBeenCalled();
    expect(supabase.channel).toHaveBeenCalledWith('apartment:a', { config: { private: true } });
    expect(mockChannel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'change' },
      expect.any(Function),
    );
  });

  it('passes on the kind of each change', async () => {
    const onChange = jest.fn();
    subscribeToTopic('apartment:a', { onChange, onCatchUp: jest.fn() });
    await settle();
    onMessage?.({ payload: { kind: 'expense', id: 'x' } });
    expect(onChange).toHaveBeenCalledWith('expense');
  });

  it('on first joining, catches up only data loaded before it started listening', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const onCatchUp = jest.fn();
    subscribeToTopic('apartment:a', { onChange: jest.fn(), onCatchUp });
    await settle();
    onStatus?.('SUBSCRIBED');
    expect(onCatchUp).toHaveBeenCalledWith(1000);
    jest.restoreAllMocks();
  });

  it('after a dropped connection, catches up everything on rejoining', async () => {
    const onCatchUp = jest.fn();
    subscribeToTopic('apartment:a', { onChange: jest.fn(), onCatchUp });
    await settle();
    onStatus?.('SUBSCRIBED');
    onStatus?.('CHANNEL_ERROR');
    onStatus?.('SUBSCRIBED');
    expect(onCatchUp).toHaveBeenLastCalledWith(Number.POSITIVE_INFINITY);
  });

  it('leaves the channel when stopped', async () => {
    const stop = subscribeToTopic('apartment:a', { onChange: jest.fn(), onCatchUp: jest.fn() });
    await settle();
    stop();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('never joins when stopped before it could', async () => {
    const stop = subscribeToTopic('apartment:a', { onChange: jest.fn(), onCatchUp: jest.fn() });
    stop();
    await settle();
    expect(supabase.channel).not.toHaveBeenCalled();
  });
});

describe('changeKindOf', () => {
  it('reads the kind, and nothing else', () => {
    expect(changeKindOf({ kind: 'payment', id: 'x' })).toBe('payment');
    expect(changeKindOf({ kind: 3 })).toBeNull();
    expect(changeKindOf(null)).toBeNull();
    expect(changeKindOf('payment')).toBeNull();
  });
});
