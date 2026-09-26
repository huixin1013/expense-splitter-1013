import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, getCurrencyMeta, CurrencyMeta } from './currencyConstants';

/**
 * Standard reference fallback exchange rates against SGD (Singapore Dollar)
 */
export const FALLBACK_RATES_SGD: Record<string, number> = {
  SGD: 1.0,
  MYR: 3.30,
  USD: 0.745,
  EUR: 0.685,
  GBP: 0.585,
  JPY: 114.50,
  THB: 26.50,
  AUD: 1.135,
  KRW: 1005.0,
  CNY: 5.38,
  IDR: 12050.0,
  TWD: 23.85,
  HKD: 5.80,
};

/**
 * Calculates exchange rate from fromCurrency to toCurrency
 * using live rates when available, and standard cross-rates as fallback.
 */
export function getConversionRate(
  fromCurrency: string = 'SGD',
  toCurrency: string = 'SGD',
  liveRates?: Record<string, number> | null
): number {
  const from = (fromCurrency || 'SGD').toUpperCase();
  const to = (toCurrency || 'SGD').toUpperCase();

  if (from === to) return 1.0;

  // 1. Try from live rates if provided
  if (liveRates) {
    if (liveRates[to] !== undefined && liveRates[from] !== undefined && liveRates[from] > 0) {
      return liveRates[to] / liveRates[from];
    }
    if (liveRates[to] !== undefined) {
      return liveRates[to];
    }
  }

  // 2. Fallback relative to SGD
  const fromRateInSgd = FALLBACK_RATES_SGD[from] || 1.0;
  const toRateInSgd = FALLBACK_RATES_SGD[to] || 1.0;

  return toRateInSgd / fromRateInSgd;
}

/**
 * Converts a monetary value in base currency to the user's viewing currency
 */
export function convertToBaseToViewing(
  baseAmount: number,
  baseCurrency: string = 'SGD',
  viewingCurrency: string = 'SGD',
  liveRates?: Record<string, number> | null
): number {
  if (!baseAmount || isNaN(baseAmount)) return 0;
  if (baseCurrency.toUpperCase() === viewingCurrency.toUpperCase()) {
    return baseAmount;
  }
  const rate = getConversionRate(baseCurrency, viewingCurrency, liveRates);
  return Math.round(baseAmount * rate * 100) / 100;
}

/**
 * Converts a monetary value entered in viewing currency back to base currency for storage
 */
export function convertViewingToBase(
  viewingAmount: number,
  viewingCurrency: string = 'SGD',
  baseCurrency: string = 'SGD',
  liveRates?: Record<string, number> | null
): number {
  if (!viewingAmount || isNaN(viewingAmount)) return 0;
  if (viewingCurrency.toUpperCase() === baseCurrency.toUpperCase()) {
    return viewingAmount;
  }
  const rate = getConversionRate(viewingCurrency, baseCurrency, liveRates);
  return Math.round(viewingAmount * rate * 100) / 100;
}

/**
 * Formats a currency amount with symbol and appropriate decimal places
 */
export function formatCurrencyDisplay(
  amount: number,
  currencyCode: string = 'SGD',
  customSymbol?: string
): string {
  const meta = getCurrencyMeta(currencyCode);
  const symbol = customSymbol || meta.symbol;
  const cleanAmount = isNaN(amount) ? 0 : amount;

  // For zero-decimal currencies like JPY/KRW/IDR when viewing whole numbers
  if (['JPY', 'KRW', 'IDR'].includes(currencyCode.toUpperCase()) && Math.abs(cleanAmount) >= 100 && Number.isInteger(cleanAmount)) {
    return `${symbol} ${cleanAmount.toLocaleString('en-US')}`;
  }

  return `${symbol} ${cleanAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
