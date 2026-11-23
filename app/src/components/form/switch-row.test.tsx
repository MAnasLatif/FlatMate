import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { SwitchRow } from './switch-row';

describe('SwitchRow', () => {
  it('reaches screen readers as one switch named by its label, with its state', async () => {
    await renderWithProviders(
      <SwitchRow
        label="Zubair"
        description="Share: Rs 66.67"
        isSelected
        onSelectedChange={jest.fn()}
      />,
    );

    const row = screen.getByRole('switch', { name: 'Zubair' });
    expect(row).toBeChecked();
    expect(row.props.accessibilityHint).toBe('Share: Rs 66.67');
    // The parts are not read out again on their own.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByText('Zubair')).not.toBeOnTheScreen();
    expect(screen.getByText('Zubair', { includeHiddenElements: true })).toBeTruthy();
  });

  it('turns off when pressed', async () => {
    const onSelectedChange = jest.fn();
    await renderWithProviders(
      <SwitchRow label="Already paid" isSelected onSelectedChange={onSelectedChange} />,
    );

    await userEvent.setup().press(screen.getByRole('switch', { name: 'Already paid' }));
    expect(onSelectedChange).toHaveBeenCalledWith(false);
  });
});
