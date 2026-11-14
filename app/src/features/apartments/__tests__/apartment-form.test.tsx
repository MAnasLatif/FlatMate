import { zodResolver } from '@hookform/resolvers/zod';
import { screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { supabase } from '@/lib/supabase';
import { renderWithProviders } from '@/test/render';

import { createApartment, updateApartmentSettings } from '../api';
import {
  ApartmentFormFields,
  type ApartmentFormInput,
  type ApartmentFormOutput,
} from '../components/apartment-form-fields';
import { apartmentFormSchema } from '../schemas';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(async () => ({ data: 'flat-id', error: null })) },
}));

const values: ApartmentFormInput = {
  name: 'Flat 4B',
  location: '',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlementDay: '1',
  approvalDays: '7',
};

function Form({ mode }: { mode: 'create' | 'settings' }) {
  const form = useForm<ApartmentFormInput, unknown, ApartmentFormOutput>({
    resolver: zodResolver(apartmentFormSchema),
    defaultValues: values,
  });
  return <ApartmentFormFields control={form.control} mode={mode} />;
}

describe('ApartmentFormFields', () => {
  it('creating picks the currency from a list, with no time zone or location switch', async () => {
    await renderWithProviders(<Form mode="create" />);

    expect(screen.getByLabelText('Currency, PKR · Pakistani rupee')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Time zone')).not.toBeOnTheScreen();
    expect(screen.queryByText('Show the location to members')).not.toBeOnTheScreen();
  });

  it('settings shows the currency locked and lets the time zone be fixed', async () => {
    await renderWithProviders(<Form mode="settings" />);

    expect(screen.getByText('The currency cannot be changed.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Time zone')).toBeOnTheScreen();
  });
});

describe('the location', () => {
  beforeEach(() => jest.clearAllMocks());

  const input = {
    name: 'Flat 4B',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    settlementDay: 1,
    approvalDays: 7,
  };

  it('is shown to members when one is given', async () => {
    await createApartment({ ...input, location: 'Gulberg' });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_apartment',
      expect.objectContaining({ p_location: 'Gulberg', p_show_location: true }),
    );
  });

  it('is not shown when left empty, also when settings are saved', async () => {
    await updateApartmentSettings('flat-id', { ...input, location: null });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'update_apartment_settings',
      expect.objectContaining({ p_location: '', p_show_location: false }),
    );
  });
});
