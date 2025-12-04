// src/services/rateService.ts
import { COINBASE_BASE_URL } from '../config/env';

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

// In-memory cache for Coinbase prices
const priceCache = new Map<SupportedCurrency, CachedPrice>();

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60_000;

// Map supported currencies to Coinbase product IDs
const CURRENCY_TO_COINBASE_PRODUCT: Record<string, string> = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  LTC: 'LTC-USD',
  SOL: 'SOL-USD',
  MATIC: 'MATIC-USD',
  DOGE: 'DOGE-USD',
};

/**
 * Fetches the current price of a cryptocurrency from Coinbase Exchange
 * @param currency - The cryptocurrency to fetch the price for
 * @returns The price of 1 unit of the currency in USD
 */
async function getPriceFromCoinbase(currency: SupportedCurrency): Promise<number> {
  const productId = CURRENCY_TO_COINBASE_PRODUCT[currency];

  if (!productId) {
    throw new Error(`Unsupported currency for Coinbase lookup: ${currency}. Supported currencies: BTC, ETH, LTC, SOL, MATIC, DOGE`);
  }

  const url = `${COINBASE_BASE_URL}/products/${productId}/ticker`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Coinbase API error: ${response.status} ${response.statusText} for symbol ${currency}`
      );
    }

    const data = await response.json() as {
      trade_id?: number;
      price: string;
      size?: string;
      bid?: string;
      ask?: string;
      volume?: string;
      time?: string;
    };

    if (!data.price) {
      throw new Error(`Coinbase response missing price for symbol ${currency}`);
    }

    const price = parseFloat(data.price);

    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price from Coinbase for ${currency}: ${data.price}`);
    }

    return price;
  } catch (error) {
    if (error instanceof Error) {
      console.error('[RateService] Failed to fetch price for', currency, 'from Coinbase:', error);
      throw new Error(`Failed to fetch price for ${currency} from Coinbase: ${error.message}`);
    }
    console.error('[RateService] Failed to fetch price for', currency, 'from Coinbase: Unknown error');
    throw new Error(`Failed to fetch price for ${currency} from Coinbase: Unknown error`);
  }
}

/**
 * Gets the cached price or fetches a new one from Coinbase
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

  // Fetch new price from Coinbase
  const priceUsd = await getPriceFromCoinbase(currency);

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

