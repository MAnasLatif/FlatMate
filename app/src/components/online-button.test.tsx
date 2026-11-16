import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { OnlineButton } from './online-button';

describe('OnlineButton', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('works while online', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<OnlineButton onPress={onPress}>Save</OnlineButton>);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled while offline, and enabled again on reconnect', async () => {
    const onPress = jest.fn();
    onlineManager.setOnline(false);
    await renderWithProviders(<OnlineButton onPress={onPress}>Save</OnlineButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();

    await act(async () => onlineManager.setOnline(true));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('stays disabled online when the screen disables it', async () => {
    await renderWithProviders(<OnlineButton isDisabled>Save</OnlineButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
