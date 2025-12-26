/**
 * In-memory cache for BrickLink price data
 * Cache TTL: 24 hours (configurable)
 */

interface CachedPriceData {
  setNumber: string;
  condition: 'new' | 'used';
  currency: string;
  itemName?: string;
  timesSold: number | null;
  avgSoldPrice: string | null;
  itemsForSale: number | null;
  avgSalePrice: string | null;
  cachedAt: number;
}

const cache = new Map<string, CachedPriceData>();

/**
 * Generate cache key
 */
function getCacheKey(setNumber: string, condition: 'new' | 'used', currency: string): string {
  return `${setNumber}:${condition}:${currency}`;
}

/**
 * Get cached data if valid
 */
export function getCachedData(
  setNumber: string,
  condition: 'new' | 'used',
  currency: string
): CachedPriceData | null {
  const key = getCacheKey(setNumber, condition, currency);
  const cached = cache.get(key);
  
  if (!cached) {
    return null;
  }
  
  const cacheTtlHours = parseInt(process.env.CACHE_TTL_HOURS || '24', 10);
  const cacheTtlMs = cacheTtlHours * 60 * 60 * 1000;
  const now = Date.now();
  
  // Check if cache is still valid
  if (now - cached.cachedAt > cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  
  return cached;
}

/**
 * Store data in cache
 */
export function setCachedData(data: Omit<CachedPriceData, 'cachedAt'>): void {
  const key = getCacheKey(data.setNumber, data.condition, data.currency);
  cache.set(key, {
    ...data,
    cachedAt: Date.now(),
  });
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const cacheTtlHours = parseInt(process.env.CACHE_TTL_HOURS || '24', 10);
  const cacheTtlMs = cacheTtlHours * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [key, value] of cache.entries()) {
    if (now - value.cachedAt > cacheTtlMs) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  cache.clear();
}

