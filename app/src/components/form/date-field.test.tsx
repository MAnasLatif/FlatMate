import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { formatDate } from '@/lib/time';
import { renderWithProviders } from '@/test/render';

import { DateField } from './date-field';

function Harness({ initial, maxDate }: { initial: string; maxDate?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="Paid on"
      value={value}
      onChange={setValue}
      today="2026-11-15"
      maxDate={maxDate}
      isClearable
    />
  );
}

describe('DateField', () => {
  it('picks a day from the calendar instead of typing', async () => {
    await renderWithProviders(<Harness initial="2026-11-15" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: /^Paid on, / }));
    await user.press(screen.getByRole('button', { name: formatDate('2026-11-03') }));

    expect(
      screen.getByRole('button', { name: `Paid on, ${formatDate('2026-11-03')}` }),
    ).toBeOnTheScreen();
  });

  it('moves between months', async () => {
    await renderWithProviders(<Harness initial="2026-11-15" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: /^Paid on, / }));
    await user.press(screen.getByRole('button', { name: 'Previous month' }));
    await user.press(screen.getByRole('button', { name: formatDate('2026-10-31') }));

    expect(
      screen.getByRole('button', { name: `Paid on, ${formatDate('2026-10-31')}` }),
    ).toBeOnTheScreen();
  });

  it('does not offer days after the latest allowed one', async () => {
    await renderWithProviders(<Harness initial="2026-11-15" maxDate="2026-11-15" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: /^Paid on, / }));

    expect(screen.getByRole('button', { name: formatDate('2026-11-16') })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('can clear an optional date', async () => {
    await renderWithProviders(<Harness initial="2026-11-15" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: /^Paid on, / }));
    await user.press(screen.getByRole('button', { name: 'Clear date' }));

    expect(screen.getByRole('button', { name: 'Paid on, not chosen' })).toBeOnTheScreen();
  });
});
