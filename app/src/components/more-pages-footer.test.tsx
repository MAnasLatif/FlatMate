import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { MorePagesFooter } from './query-states';

describe('MorePagesFooter', () => {
  afterEach(async () => {
    await act(async () => onlineManager.setOnline(true));
  });
  const pages = {
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: jest.fn(),
  };

  it('says offline that more will load later, so the list does not look complete', async () => {
    await act(async () => onlineManager.setOnline(false));
    await renderWithProviders(<MorePagesFooter pages={pages} noun="expenses" />);
    expect(screen.getByText("More expenses load when you're back online.")).toBeTruthy();
  });

  it('shows nothing online until more is loading, and a retry when that fails', async () => {
    await renderWithProviders(<MorePagesFooter pages={pages} noun="expenses" />);
    expect(screen.queryByText(/More expenses/)).toBeNull();

    await renderWithProviders(
      <MorePagesFooter pages={{ ...pages, isFetchNextPageError: true }} noun="expenses" />,
    );
    expect(screen.getByText('Could not load more. Try again')).toBeTruthy();
  });

  it('says nothing offline when there is no more to load', async () => {
    await act(async () => onlineManager.setOnline(false));
    await renderWithProviders(
      <MorePagesFooter pages={{ ...pages, hasNextPage: false }} noun="expenses" />,
    );
    expect(screen.queryByText(/More expenses/)).toBeNull();
  });
});
