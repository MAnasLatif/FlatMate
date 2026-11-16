import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { formatMonth } from '@/lib/time';
import { renderWithProviders } from '@/test/render';

import { MonthSelector } from './month-selector';

function Harness({ initial }: { initial: string }) {
  const [month, setMonth] = useState(initial);
  return <MonthSelector month={month} latestMonth="2026-11-01" onChange={setMonth} />;
}

describe('MonthSelector', () => {
  it('jumps to a month of the previous year from the wheels', async () => {
    await renderWithProviders(<Harness initial="2026-11-01" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: `Showing ${formatMonth('2026-11-01')}` }));
    await user.press(screen.getByRole('button', { name: '2025' }));
    await user.press(screen.getByRole('button', { name: formatMonth('2025-12-01') }));
    await user.press(screen.getByRole('button', { name: 'Done' }));

    expect(
      screen.getByRole('button', { name: `Showing ${formatMonth('2025-12-01')}` }),
    ).toBeOnTheScreen();
  });

  it('offers only this year and last year, and no months after the latest', async () => {
    await renderWithProviders(<Harness initial="2026-11-01" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: `Showing ${formatMonth('2026-11-01')}` }));

    expect(screen.getByRole('button', { name: '2026' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '2025' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '2024' })).toBeNull();
    expect(screen.getByRole('button', { name: formatMonth('2026-10-01') })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: formatMonth('2026-12-01') })).toBeNull();
  });

  it('steps back across the new year but not before January of last year', async () => {
    await renderWithProviders(<Harness initial="2026-01-01" />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      screen.getByRole('button', { name: `Showing ${formatMonth('2025-12-01')}` }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
  });

  it('hides the back arrow at January of last year', async () => {
    await renderWithProviders(<Harness initial="2025-01-01" />);

    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeOnTheScreen();
  });
});

it('stops at the latest month when switching from a later month of last year', async () => {
  await renderWithProviders(<Harness initial="2025-12-01" />);
  const user = userEvent.setup();

  await user.press(screen.getByRole('button', { name: `Showing ${formatMonth('2025-12-01')}` }));
  await user.press(screen.getByRole('button', { name: '2026' }));
  await user.press(screen.getByRole('button', { name: 'Done' }));

  expect(
    screen.getByRole('button', { name: `Showing ${formatMonth('2026-11-01')}` }),
  ).toBeOnTheScreen();
});
