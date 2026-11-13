import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';

import { formatDateTime } from '@/lib/time';
import { renderWithProviders } from '@/test/render';

import { OfflineBanner, offlineMessage } from './offline-banner';

describe('offlineMessage', () => {
  it('says when the data was last updated', () => {
    const updatedAt = Date.UTC(2026, 10, 14, 9, 14);
    expect(offlineMessage(updatedAt)).toBe(
      `You're offline. Last updated ${formatDateTime(updatedAt)}.`,
    );
  });

  it('leaves the time out before anything has loaded', () => {
    expect(offlineMessage(0)).toBe("You're offline.");
    expect(offlineMessage(undefined)).toBe("You're offline.");
  });
});

describe('OfflineBanner', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('shows nothing while online', async () => {
    await renderWithProviders(<OfflineBanner updatedAt={Date.now()} />);
    expect(screen.queryByText(/offline/)).toBeNull();
  });

  it('shows the offline message while offline', async () => {
    onlineManager.setOnline(false);
    await renderWithProviders(<OfflineBanner updatedAt={0} />);
    expect(screen.getByText("You're offline.")).toBeTruthy();
  });
});
