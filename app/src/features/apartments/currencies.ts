/**
 * Currencies offered when creating an apartment. The database accepts any
 * 3-letter code; these are the ones flatmates are most likely to use.
 */
export const CURRENCIES: readonly { code: string; name: string }[] = [
  { code: 'PKR', name: 'Pakistani rupee' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'QAR', name: 'Qatari riyal' },
  { code: 'KWD', name: 'Kuwaiti dinar' },
  { code: 'OMR', name: 'Omani rial' },
  { code: 'BHD', name: 'Bahraini dinar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'BDT', name: 'Bangladeshi taka' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
];
