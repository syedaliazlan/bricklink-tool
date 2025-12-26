import { NextRequest, NextResponse } from 'next/server';
import { lookupJobRequestSchema } from '@/lib/utils/validation';
import { deduplicateSets } from '@/lib/utils/validation';
import { processSets } from '@/lib/services/lookup-service';
import { clearAllCache } from '@/lib/services/cache';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/lookups
 * Process bulk lookup synchronously
 */
export async function POST(request: NextRequest) {
  const requestId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logger.info(`[API] [${requestId}] Received lookup request`);
  
  try {
    const body = await request.json();
    logger.debug(`[API] [${requestId}] Request body:`, {
      setsCount: body.sets?.length || 0,
      forceRefresh: body.forceRefresh || false,
    });
    
    // Validate request
    const validation = lookupJobRequestSchema.safeParse(body);
    
    if (!validation.success) {
      logger.error(`[API] [${requestId}] Validation failed:`, validation.error.errors);
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }
    
    const { sets, forceRefresh } = validation.data;
    logger.info(`[API] [${requestId}] Processing ${sets.length} sets, forceRefresh: ${forceRefresh}`);
    
    // Clear cache if force refresh is requested
    if (forceRefresh) {
      logger.info(`[API] [${requestId}] Clearing cache (force refresh)`);
      clearAllCache();
    }
    
    // Deduplicate sets
    const uniqueSets = deduplicateSets(sets);
    logger.debug(`[API] [${requestId}] After deduplication: ${uniqueSets.length} unique sets`);
    
    if (uniqueSets.length === 0) {
      logger.warn(`[API] [${requestId}] No valid sets to process`);
      return NextResponse.json(
        { error: 'No valid sets to process' },
        { status: 400 }
      );
    }
    
    if (uniqueSets.length > 600) {
      logger.warn(`[API] [${requestId}] Too many sets: ${uniqueSets.length}`);
      return NextResponse.json(
        { error: 'Maximum 600 sets allowed per lookup' },
        { status: 400 }
      );
    }
    
    // Process sets synchronously with GBP currency
    logger.info(`[API] [${requestId}] Starting to process sets...`);
    const startTime = Date.now();
    const results = await processSets(uniqueSets, 'GBP', forceRefresh);
    const duration = Date.now() - startTime;
    
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    logger.info(`[API] [${requestId}] Processing completed:`, {
      duration: `${duration}ms`,
      resultsCount: results.length,
      successful,
      failed,
    });
    
    return NextResponse.json({
      status: 'completed',
      totalSets: uniqueSets.length,
      results,
    });
    
  } catch (error) {
    logger.error(`[API] [${requestId}] Error processing lookup:`, {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

