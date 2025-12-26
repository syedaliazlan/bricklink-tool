import { NextRequest, NextResponse } from 'next/server';
import { lookupJobRequestSchema } from '@/lib/utils/validation';
import { deduplicateSets } from '@/lib/utils/validation';
import { processSets } from '@/lib/services/lookup-service';
import { clearAllCache } from '@/lib/services/cache';

/**
 * POST /api/lookups
 * Process bulk lookup synchronously
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const validation = lookupJobRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }
    
    const { sets, forceRefresh } = validation.data;
    
    // Clear cache if force refresh is requested
    if (forceRefresh) {
      clearAllCache();
    }
    
    // Deduplicate sets
    const uniqueSets = deduplicateSets(sets);
    
    if (uniqueSets.length === 0) {
      return NextResponse.json(
        { error: 'No valid sets to process' },
        { status: 400 }
      );
    }
    
    if (uniqueSets.length > 600) {
      return NextResponse.json(
        { error: 'Maximum 600 sets allowed per lookup' },
        { status: 400 }
      );
    }
    
    // Process sets synchronously with GBP currency
    const results = await processSets(uniqueSets, 'GBP', forceRefresh);
    
    return NextResponse.json({
      status: 'completed',
      totalSets: uniqueSets.length,
      results,
    });
    
  } catch (error) {
    console.error('[API] Error processing lookup:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

