import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';

import { formatDateTime } from '@/lib/time';
import { renderWithProviders } from '@/test/render';

import { FreshnessBanner, freshnessMessage } from './freshness-banner';

const updatedAt = Date.UTC(2026, 10, 14, 9, 14);

describe('freshnessMessage', () => {
  it('offline, says when the data was last updated and that saving needs a connection', () => {
    expect(freshnessMessage(false, updatedAt, false)).toBe(
      `You're offline. Last updated ${formatDateTime(updatedAt)}. Saving needs a connection.`,
    );
  });

  it('offline before anything loaded, leaves the time out', () => {
    expect(freshnessMessage(false, 0, false)).toBe("You're offline. Saving needs a connection.");
    expect(freshnessMessage(false, undefined, false)).toBe(
      "You're offline. Saving needs a connection.",
    );
  });

  it('online, reports a failed refresh over saved data', () => {
    expect(freshnessMessage(true, updatedAt, true)).toBe(
      `Could not refresh. Showing what was loaded ${formatDateTime(updatedAt)}.`,
    );
  });

  it('says nothing when the data is current', () => {
    expect(freshnessMessage(true, updatedAt, false)).toBeNull();
    expect(freshnessMessage(true, undefined, false)).toBeNull();
  });
});

describe('FreshnessBanner', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('shows nothing while online', async () => {
    await renderWithProviders(
      <FreshnessBanner freshness={{ dataUpdatedAt: updatedAt, isRefetchError: false }} />,
    );
    expect(screen.queryByText(/offline/)).toBeNull();
  });

  it('shows the offline message while offline', async () => {
    onlineManager.setOnline(false);
    await renderWithProviders(<FreshnessBanner />);
    expect(screen.getByText("You're offline. Saving needs a connection.")).toBeOnTheScreen();
  });
});
