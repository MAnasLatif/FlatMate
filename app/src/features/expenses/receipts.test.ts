import { supabase } from '@/lib/supabase';

import type { PickedImage } from '@/lib/private-images';

import { receiptPathFor, uploadReceipt } from './api';
import { receiptUploadErrorMessage } from './errors';

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() }, rpc: jest.fn() },
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const receipt: PickedImage = {
  id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  uri: 'file:///receipt.jpg',
  mimeType: 'image/jpeg',
};
const path = `${APARTMENT}/${EXPENSE}/${receipt.id}.jpg`;

const upload = jest.fn();
const rpc = jest.mocked(supabase.rpc);

const realFetch = globalThis.fetch;

beforeEach(() => {
  jest.mocked(supabase.storage.from).mockReturnValue({ upload } as never);
  globalThis.fetch = jest.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as unknown as Response);
  upload.mockReset();
  rpc.mockReset();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('receiptPathFor', () => {
  it('files the photo under its apartment and expense, named by its id', () => {
    expect(receiptPathFor(APARTMENT, EXPENSE, receipt)).toBe(path);
    expect(receiptPathFor(APARTMENT, EXPENSE, { ...receipt, mimeType: 'image/webp' })).toMatch(
      /\.webp$/,
    );
  });
});

describe('uploadReceipt', () => {
  it('uploads the photo, then registers it on the expense', async () => {
    upload.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null } as never);

    await uploadReceipt(APARTMENT, EXPENSE, receipt);

    expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    expect(upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
    });
    expect(rpc).toHaveBeenCalledWith('add_expense_attachment', {
      p_expense_id: EXPENSE,
      p_storage_path: path,
    });
  });

  it('registers a photo that an earlier attempt already uploaded', async () => {
    upload.mockResolvedValue({ error: { status: 400, statusCode: '409', message: 'Duplicate' } });
    rpc.mockResolvedValue({ error: null } as never);

    await uploadReceipt(APARTMENT, EXPENSE, receipt);

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('stops when the upload is refused', async () => {
    const refused = { status: 400, statusCode: '413', message: 'Payload too large' };
    upload.mockResolvedValue({ error: refused });

    await expect(uploadReceipt(APARTMENT, EXPENSE, receipt)).rejects.toBe(refused);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails when the registration fails', async () => {
    const failed = { code: '22023', message: 'receipt_not_uploaded' };
    upload.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: failed } as never);

    await expect(uploadReceipt(APARTMENT, EXPENSE, receipt)).rejects.toBe(failed);
  });
});

describe('receiptUploadErrorMessage', () => {
  it('explains the bucket limits', () => {
    expect(receiptUploadErrorMessage({ status: 400, statusCode: '413' })).toMatch(/under 10 MB/);
    expect(receiptUploadErrorMessage({ status: 415 })).toMatch(/JPEG, PNG or WebP/);
  });

  it('explains database refusals without exposing them', () => {
    expect(receiptUploadErrorMessage({ message: 'receipt_not_uploaded' })).toMatch(
      /did not finish uploading/,
    );
    expect(receiptUploadErrorMessage({ message: 'expense_not_found' })).toBe(
      'This expense no longer exists.',
    );
    expect(receiptUploadErrorMessage({ status: 500, message: 'internal detail' })).toBe(
      'Could not upload the receipt. Please try again.',
    );
  });
});
