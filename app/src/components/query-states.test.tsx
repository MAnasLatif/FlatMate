import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { loadingError, LoadingRows, PendingSkeleton } from './query-states';

describe('LoadingRows', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('shows placeholders while online', async () => {
    await renderWithProviders(<LoadingRows />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says the data will load once back online, instead of loading forever', async () => {
    onlineManager.setOnline(false);
    await renderWithProviders(<LoadingRows />);
    expect(screen.getByText("This will load when you're back online.")).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });
});

describe('PendingSkeleton', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('shows a placeholder online and says it loads when online otherwise', async () => {
    await renderWithProviders(
      <PendingSkeleton className="h-5" accessibilityLabel="Loading your share" />,
    );
    expect(screen.getByLabelText('Loading your share')).toBeTruthy();

    screen.unmount();
    onlineManager.setOnline(false);
    await renderWithProviders(
      <PendingSkeleton
        className="h-5"
        accessibilityLabel="Loading photo"
        offlineText="Available when online"
      />,
    );
    expect(screen.getByText('Available when online')).toBeTruthy();
  });
});

describe('loadingError', () => {
  it('reports only queries that never loaded', () => {
    const failedFirstLoad = { isLoadingError: true, error: new Error('first') };
    const failedRefresh = { isLoadingError: false, error: new Error('refresh') };
    const fine = { isLoadingError: false, error: null };
    expect(loadingError(fine, failedRefresh)).toBeNull();
    expect(loadingError(failedRefresh, failedFirstLoad)).toBe(failedFirstLoad.error);
  });
});
