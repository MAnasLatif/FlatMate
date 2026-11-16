import { act, screen } from '@testing-library/react-native';
import Stack from 'expo-router/stack';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import * as AuthLayout from '@/app/(auth)/_layout';

import { RootNavigator } from '../components/root-navigator';

type SessionState = {
  session: { user: { id: string } } | null;
  isLoading: boolean;
  isRestoring: boolean;
  isNavigationHeld: boolean;
};

// A stand-in for the session provider: a store the navigator re-renders from,
// as it does from the real provider's context.
const mockStore = {
  state: {
    session: null,
    isLoading: true,
    isRestoring: false,
    isNavigationHeld: false,
  } as SessionState,
  listeners: new Set<() => void>(),
  set(next: Partial<SessionState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  },
};
jest.mock('../session-provider', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useSession: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockStore.listeners.add(listener);
          return () => mockStore.listeners.delete(listener);
        },
        () => mockStore.state,
      ),
  };
});

/** The real navigator and signed-out layout, over stand-ins for the screens. */
const routes = {
  _layout: RootNavigator,
  '(app)/_layout': () => <Stack />,
  '(app)/index': () => <Text>Your apartments</Text>,
  // The real signed-out layout, which opens sign-in by default.
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-in': () => <Text>Sign in</Text>,
  '+not-found': () => <Text>Page not found</Text>,
};

const signedIn = { user: { id: 'user-1' } };

function start(state: SessionState) {
  mockStore.state = state;
  mockStore.listeners.clear();
  return renderRouter(routes, { initialUrl: '/' });
}

describe('RootNavigator', () => {
  it('at launch with a saved session, waits for loading, then opens the home', async () => {
    await start({ session: signedIn, isLoading: true, isRestoring: true, isNavigationHeld: false });
    expect(screen.queryByText('Page not found')).not.toBeOnTheScreen();
    expect(screen.queryByText('Sign in')).not.toBeOnTheScreen();

    await act(async () => mockStore.set({ isLoading: false, isRestoring: false }));
    expect(await screen.findByText('Your apartments')).toBeOnTheScreen();
    expect(screen.queryByText('Page not found')).not.toBeOnTheScreen();
  });

  it('opens sign-in for someone signed out', async () => {
    await start({ session: null, isLoading: false, isRestoring: false, isNavigationHeld: false });
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
  });

  it('after signing in, opens the home once that user is restored', async () => {
    await start({ session: null, isLoading: false, isRestoring: false, isNavigationHeld: false });
    expect(screen.getByText('Sign in')).toBeOnTheScreen();

    await act(async () => mockStore.set({ session: signedIn, isRestoring: true }));
    expect(screen.queryByText('Page not found')).not.toBeOnTheScreen();

    await act(async () => mockStore.set({ isRestoring: false }));
    expect(await screen.findByText('Your apartments')).toBeOnTheScreen();
  });

  it('never strands a signed-in user on "not found", even if it renders mid-restore', async () => {
    await start({
      session: signedIn,
      isLoading: false,
      isRestoring: true,
      isNavigationHeld: false,
    });
    expect(screen.queryByText('Page not found')).not.toBeOnTheScreen();

    await act(async () => mockStore.set({ isRestoring: false }));
    expect(await screen.findByText('Your apartments')).toBeOnTheScreen();
  });

  it('after signing out, opens sign-in', async () => {
    await start({
      session: signedIn,
      isLoading: false,
      isRestoring: false,
      isNavigationHeld: false,
    });
    expect(await screen.findByText('Your apartments')).toBeOnTheScreen();

    await act(async () => mockStore.set({ session: null }));
    expect(await screen.findByText('Sign in')).toBeOnTheScreen();
  });
});
