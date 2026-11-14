import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { type PickedImage, pickImage } from '@/lib/private-images';
import { renderWithProviders } from '@/test/render';

import { ReceiptsField } from '../components/receipts-field';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/private-images', () => ({
  ...jest.requireActual('@/lib/private-images'),
  pickImage: jest.fn(),
}));

const photo = (id: string): PickedImage => ({
  id,
  uri: `file:///${id}.jpg`,
  mimeType: 'image/jpeg',
});

function Harness() {
  const [receipts, setReceipts] = useState<PickedImage[]>([]);
  return <ReceiptsField receipts={receipts} onChange={setReceipts} />;
}

describe('ReceiptsField', () => {
  it('takes photos with the camera or picks them from the gallery, as many as needed', async () => {
    jest
      .mocked(pickImage)
      .mockResolvedValueOnce({ image: photo('one') })
      .mockResolvedValueOnce({ image: photo('two') });
    await renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Add a receipt' }));
    await user.press(screen.getByRole('button', { name: 'Take a photo' }));
    expect(pickImage).toHaveBeenLastCalledWith('camera');

    await user.press(screen.getByRole('button', { name: 'Add another receipt' }));
    await user.press(screen.getByRole('button', { name: 'Choose from gallery' }));
    expect(pickImage).toHaveBeenLastCalledWith('library');

    expect(screen.getByLabelText('Receipt 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Receipt 2')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Remove receipt 1' }));
    expect(screen.queryByLabelText('Receipt 2')).not.toBeOnTheScreen();
  });

  it('says why a photo could not be used', async () => {
    jest.mocked(pickImage).mockResolvedValueOnce({
      error: 'Allow FlatMate to use the camera in your phone settings to take a photo.',
    });
    await renderWithProviders(<Harness />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Add a receipt' }));
    await user.press(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText(/Allow FlatMate to use the camera/)).toBeOnTheScreen();
  });
});
