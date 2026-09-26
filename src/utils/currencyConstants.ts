export interface CurrencyMeta {
  code: string;
  symbol: string;
  label: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'SGD', symbol: 'SGD', label: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'USD', symbol: '$', label: 'US Dollar', flag: '🇺🇸' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'EUR', symbol: '€', label: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', label: 'British Pound', flag: '🇬🇧' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht', flag: '🇹🇭' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'KRW', symbol: '₩', label: 'Korean Won', flag: '🇰🇷' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'TWD', symbol: 'NT$', label: 'New Taiwan Dollar', flag: '🇹🇼' },
  { code: 'HKD', symbol: 'HK$', label: 'Hong Kong Dollar', flag: '🇭🇰' },
];

export const DEFAULT_CURRENCY = SUPPORTED_CURRENCIES[0]; // SGD (SGD)

export function getCurrencyByCode(code?: string): CurrencyMeta {
  if (!code) return DEFAULT_CURRENCY;
  const found = SUPPORTED_CURRENCIES.find(c => c.code.toUpperCase() === code.toUpperCase());
  return found || { code, symbol: '$', label: code, flag: '🌐' };
}

export const getCurrencyMeta = getCurrencyByCode;
