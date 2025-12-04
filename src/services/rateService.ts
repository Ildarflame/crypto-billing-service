// src/services/rateService.ts
import { config } from '../config/env';

export type SupportedCurrency =
  | 'BTC'
  | 'ETH'
  | 'SOL'
  | 'MATIC'
  | 'DOGE'
  | 'LTC'
  | 'DASH'
  | 'BNB'
  | 'AVAX'
  | 'USDT'
  | 'USDC';

export type KeagateCurrency =
  | 'BTC'
  | 'ETH'
  | 'SOL'
  | 'MATIC'
  | 'DOGE'
  | 'LTC';

type CachedPrice = {
  priceUsd: number;
  fetchedAt: number;
};

// In-memory cache for Binance prices
const priceCache = new Map<SupportedCurrency, CachedPrice>();

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60_000;

// Map supported currencies to Binance ticker symbols
const CURRENCY_TO_BINANCE_SYMBOL: Record<SupportedCurrency, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  MATIC: 'MATICUSDT',
  DOGE: 'DOGEUSDT',
  LTC: 'LTCUSDT',
  DASH: 'DASHUSDT',
  BNB: 'BNBUSDT',
  AVAX: 'AVAXUSDT',
  USDT: 'USDTUSDT', // Not used, but included for completeness
  USDC: 'USDCUSDT', // Not used, but included for completeness
};

/**
 * Fetches the current price of a cryptocurrency from Binance
 * @param currency - The cryptocurrency to fetch the price for
 * @returns The price of 1 unit of the currency in USD
 */
async function fetchPriceFromBinance(currency: SupportedCurrency): Promise<number> {
  const binanceBaseUrl = config.binance?.baseUrl || 'https://api.binance.com';
  const symbol = CURRENCY_TO_BINANCE_SYMBOL[currency];

  if (!symbol) {
    throw new Error(`Unsupported currency for Binance lookup: ${currency}`);
  }

  const url = `${binanceBaseUrl}/api/v3/ticker/price?symbol=${symbol}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Binance API error: ${response.status} ${response.statusText} for symbol ${symbol}`
      );
    }

    const data = await response.json() as { symbol: string; price: string };

    if (!data.price) {
      throw new Error(`Binance response missing price for symbol ${symbol}`);
    }

    const price = parseFloat(data.price);

    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price from Binance for ${symbol}: ${data.price}`);
    }

    return price;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch price for ${currency} from Binance: ${error.message}`);
    }
    throw new Error(`Failed to fetch price for ${currency} from Binance: Unknown error`);
  }
}

/**
 * Gets the cached price or fetches a new one from Binance
 * @param currency - The cryptocurrency to get the price for
 * @returns The price of 1 unit of the currency in USD
 */
async function getPriceUsd(currency: SupportedCurrency): Promise<number> {
  // For stablecoins, return 1.0 (1:1 with USD)
  if (currency === 'USDT' || currency === 'USDC') {
    return 1.0;
  }

  const now = Date.now();
  const cached = priceCache.get(currency);

  // Check if we have a valid cached price
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.priceUsd;
  }

  // Fetch new price from Binance
  const priceUsd = await fetchPriceFromBinance(currency);

  // Update cache
  priceCache.set(currency, {
    priceUsd,
    fetchedAt: now,
  });

  return priceUsd;
}

/**
 * Converts a USD amount to the equivalent amount in a cryptocurrency
 * @param amountUsd - The amount in USD to convert
 * @param currency - The target cryptocurrency
 * @returns The equivalent amount in the target cryptocurrency, rounded to 8 decimal places
 */
export async function convertUsdToCrypto(
  amountUsd: number,
  currency: SupportedCurrency
): Promise<number> {
  if (amountUsd < 0) {
    throw new Error(`Invalid amount: ${amountUsd}. Amount must be non-negative.`);
  }

  // For stablecoins, return the USD amount as-is (1:1 conversion)
  if (currency === 'USDT' || currency === 'USDC') {
    return parseFloat(amountUsd.toFixed(8));
  }

  // Get the current price of 1 unit of the currency in USD
  const priceUsdPerCoin = await getPriceUsd(currency);

  // Convert: amountCrypto = amountUsd / priceUsdPerCoin
  const amountCrypto = amountUsd / priceUsdPerCoin;

  // Round to 8 decimal places
  return parseFloat(amountCrypto.toFixed(8));
}

