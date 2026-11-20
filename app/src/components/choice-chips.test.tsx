import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { ChoiceChips } from './choice-chips';

const choices = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'other', label: 'Other' },
] as const;

describe('ChoiceChips', () => {
  it('selects a chip and says which one is selected', async () => {
    const onSelect = jest.fn();
    await renderWithProviders(
      <ChoiceChips
        choices={choices}
        selected="cleaning"
        onSelect={onSelect}
        accessibilityLabel="Category"
      />,
    );

    expect(screen.getByRole('button', { name: 'Cleaning' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Other' }));
    expect(onSelect).toHaveBeenCalledWith('other');
  });

  it('answers touches over 48 dp although each chip is drawn 28 dp high', async () => {
    await renderWithProviders(
      <ChoiceChips
        choices={choices}
        selected={null}
        onSelect={jest.fn()}
        accessibilityLabel="Category"
      />,
    );

    expect(screen.getByRole('button', { name: 'Other' }).props.hitSlop).toEqual({
      top: 10,
      bottom: 10,
    });
  });
});
