import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { LoadingRows } from './query-states';

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
