import { NextResponse } from 'next/server';
import { getBricklinkClient } from '@/lib/bricklink';

/**
 * GET /api/health
 * Health check endpoint
 */
export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      bricklink: false,
    },
  };

  try {
    // Check BrickLink API (optional, may be slow)
    const skipBricklinkCheck = process.env.SKIP_BRICKLINK_HEALTH_CHECK === 'true';
    
    if (!skipBricklinkCheck) {
      const client = getBricklinkClient();
      health.checks.bricklink = await client.healthCheck();
    } else {
      health.checks.bricklink = true; // Assume OK if skipped
    }
  } catch (error) {
    console.error('[Health] BrickLink health check failed:', error instanceof Error ? error.message : 'Unknown error');
  }

  const allHealthy = Object.values(health.checks).every(check => check === true);
  health.status = allHealthy ? 'ok' : 'degraded';

  return NextResponse.json(health, {
    status: allHealthy ? 200 : 503,
  });
}

