import { getBricklinkClient } from '@/lib/bricklink';
import { toBricklinkCondition, decodeHtmlEntities } from '@/lib/utils/formatting';
import { getCachedData, setCachedData } from './cache';
import pLimit from 'p-limit';
import type { SetPriceResult } from '@/types';

/**
 * Fetch price data for a single set
 */
async function fetchSetPriceData(
  setNumber: string,
  condition: 'new' | 'used',
  currency: string,
  forceRefresh: boolean = false,
  onProgress?: () => void
): Promise<SetPriceResult> {
  const client = getBricklinkClient();
  const brickCondition = toBricklinkCondition(condition);
  
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedData(setNumber, condition, currency);
    if (cached) {
      // Notify progress for cached items (they're instant)
      if (onProgress) onProgress();
      return {
      setNumber: cached.setNumber,
      setName: decodeHtmlEntities(cached.itemName),
      condition: cached.condition,
      timesSold: cached.timesSold,
      avgSoldPrice: cached.avgSoldPrice,
      minSoldPrice: null,
      maxSoldPrice: null,
      itemsForSale: cached.itemsForSale,
      avgSalePrice: cached.avgSalePrice,
      minSalePrice: null,
      maxSalePrice: null,
      status: 'success',
      currency: cached.currency,
      lastUpdated: new Date(cached.cachedAt).toISOString(),
    };
    }
  }
  
  try {
    console.log(`[Lookup] Starting fetch for set ${setNumber} (${condition}, ${currency})`);
    
    // Fetch data sequentially to avoid rate limit issues
    // Each set makes 3 API calls, so we space them out with small delays
    console.log(`[Lookup] Fetching sold data for ${setNumber}...`);
    const soldData = await client.getPriceGuideSold({
      itemType: 'SET',
      itemNo: setNumber,
      condition: brickCondition,
      currency,
    }).catch(err => {
      console.error(`[Lookup] Failed to fetch sold data for ${setNumber}:`, {
        error: err instanceof Error ? err.message : String(err),
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        stack: err instanceof Error ? err.stack : undefined,
        setNumber,
        condition: brickCondition,
        currency,
      });
      return null;
    });
    console.log(`[Lookup] Sold data for ${setNumber}:`, soldData ? 'Received' : 'Failed');
    
    // Small delay between the 3 API calls per set
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`[Lookup] Fetching stock data for ${setNumber}...`);
    const stockData = await client.getPriceGuideStock({
      itemType: 'SET',
      itemNo: setNumber,
      condition: brickCondition,
      currency,
    }).catch(err => {
      console.error(`[Lookup] Failed to fetch stock data for ${setNumber}:`, {
        error: err instanceof Error ? err.message : String(err),
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        stack: err instanceof Error ? err.stack : undefined,
        setNumber,
        condition: brickCondition,
        currency,
      });
      return null;
    });
    console.log(`[Lookup] Stock data for ${setNumber}:`, stockData ? 'Received' : 'Failed');
    
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`[Lookup] Fetching item data for ${setNumber}...`);
    const itemData = await client.getItem('SET', setNumber).catch(err => {
      console.error(`[Lookup] Failed to fetch item data for ${setNumber}:`, {
        error: err instanceof Error ? err.message : String(err),
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        stack: err instanceof Error ? err.stack : undefined,
        setNumber,
      });
      return null;
    });
    console.log(`[Lookup] Item data for ${setNumber}:`, itemData ? 'Received' : 'Failed');
    
    const result: SetPriceResult = {
      setNumber,
      setName: decodeHtmlEntities(itemData?.name),
      condition,
      timesSold: soldData?.unit_quantity || null,
      avgSoldPrice: soldData?.avg_price || null,
      minSoldPrice: null,
      maxSoldPrice: null,
      itemsForSale: stockData?.unit_quantity || null,
      avgSalePrice: stockData?.avg_price || null,
      minSalePrice: null,
      maxSalePrice: null,
      status: 'success',
      currency,
      lastUpdated: new Date().toISOString(),
    };
    
    console.log(`[Lookup] Successfully fetched data for ${setNumber}:`, {
      hasName: !!result.setName,
      timesSold: result.timesSold,
      avgSoldPrice: result.avgSoldPrice,
      itemsForSale: result.itemsForSale,
      avgSalePrice: result.avgSalePrice,
    });
    
    // Cache the result (store decoded name to avoid re-decoding on cache hit)
    const decodedName = decodeHtmlEntities(itemData?.name);
    setCachedData({
      setNumber,
      condition,
      currency,
      itemName: decodedName,
      timesSold: soldData?.unit_quantity || null,
      avgSoldPrice: soldData?.avg_price || null,
      itemsForSale: stockData?.unit_quantity || null,
      avgSalePrice: stockData?.avg_price || null,
    });
    
    // Notify progress for API-fetched items
    if (onProgress) onProgress();
    
    return result;
  } catch (error) {
    console.error(`[Lookup] Error fetching data for ${setNumber}:`, {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      setNumber,
      condition,
      currency,
    });
    return {
      setNumber,
      condition,
      timesSold: null,
      avgSoldPrice: null,
      minSoldPrice: null,
      maxSoldPrice: null,
      itemsForSale: null,
      avgSalePrice: null,
      minSalePrice: null,
      maxSalePrice: null,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      currency,
    };
  }
}

/**
 * Process multiple sets with rate limiting and caching
 */
export async function processSets(
  sets: Array<{ setNumber: string; condition: 'new' | 'used' }>,
  currency: string,
  forceRefresh: boolean = false,
  onProgress?: (completed: number, total: number) => void
): Promise<SetPriceResult[]> {
  // BrickLink allows 5,000 requests/day
  // Optimized for ~20 min: Process 3 sets concurrently, each making 3 sequential API calls
  // This allows ~30 sets/min = 600 sets in ~20 minutes, well under daily limit
  const limit = pLimit(parseInt(process.env.BRICKLINK_CONCURRENT_REQUESTS || '3', 10));
  
  let completedCount = 0;
  const total = sets.length;
  
  const results = await Promise.all(
    sets.map((set) =>
      limit(async () => {
        const result = await fetchSetPriceData(
          set.setNumber, 
          set.condition, 
          currency, 
          forceRefresh,
          () => {
            completedCount++;
            if (onProgress) {
              onProgress(completedCount, total);
            }
          }
        );
        return result;
      })
    )
  );
  
  return results;
}
