import { act, screen } from '@testing-library/react-native';
import { BottomSheet, Typography } from 'heroui-native';
import { useState } from 'react';

import { renderWithProviders } from '@/test/render';

import { Sheet } from './sheet';

// The mocked native sheet (jest.setup.ts) keeps every mounted sheet by name.
const { ReanimatedTrueSheet } = jest.requireMock<{
  ReanimatedTrueSheet: {
    instances: Record<string, { props: { onDidDismiss: (event: unknown) => void } }>;
  };
}>('@lodev09/react-native-true-sheet/reanimated');

function TestSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Sheet name="test-sheet" isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Content>
        <Typography.Paragraph>Sheet content</Typography.Paragraph>
      </BottomSheet.Content>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('shows its content only while open', async () => {
    const onOpenChange = jest.fn();
    await renderWithProviders(<TestSheet isOpen={false} onOpenChange={onOpenChange} />);
    expect(screen.queryByText('Sheet content')).not.toBeOnTheScreen();

    await screen.rerender(<TestSheet isOpen onOpenChange={onOpenChange} />);
    expect(screen.getByText('Sheet content')).toBeOnTheScreen();

    await screen.rerender(<TestSheet isOpen={false} onOpenChange={onOpenChange} />);
    expect(screen.queryByText('Sheet content')).not.toBeOnTheScreen();
    // Closed by the app, so there is nothing to report back.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('reports a close by the person, such as a drag down', async () => {
    const onOpenChange = jest.fn();
    // Like the app's screens, the parent keeps the open state.
    function Parent() {
      const [isOpen, setOpen] = useState(true);
      return (
        <TestSheet
          isOpen={isOpen}
          onOpenChange={(open) => {
            onOpenChange(open);
            setOpen(open);
          }}
        />
      );
    }
    await renderWithProviders(<Parent />);
    expect(screen.getByText('Sheet content')).toBeOnTheScreen();

    const sheet = ReanimatedTrueSheet.instances['test-sheet'];
    await act(async () => sheet.props.onDidDismiss({ nativeEvent: {} }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Sheet content')).not.toBeOnTheScreen();
  });
});
