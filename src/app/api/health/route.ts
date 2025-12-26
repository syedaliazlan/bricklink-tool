import { NextResponse } from 'next/server';
import { getBricklinkClient } from '@/lib/bricklink';

/**
 * GET /api/health
 * Health check endpoint with detailed diagnostics
 */
export async function GET() {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      bricklink: false,
    },
    diagnostics: {
      environment: process.env.NODE_ENV,
      credentials: {
        hasConsumerKey: !!process.env.BRICKLINK_CONSUMER_KEY,
        hasConsumerSecret: !!process.env.BRICKLINK_CONSUMER_SECRET,
        hasToken: !!process.env.BRICKLINK_TOKEN,
        hasTokenSecret: !!process.env.BRICKLINK_TOKEN_SECRET,
        consumerKeyLength: process.env.BRICKLINK_CONSUMER_KEY?.length || 0,
        tokenLength: process.env.BRICKLINK_TOKEN?.length || 0,
      },
      serverIP: null as string | null,
    },
  };

  // Try to get server's public IP
  try {
    console.log('[Health] Attempting to detect server IP...');
    const ipResponse = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (ipResponse.ok) {
      const ipData = await ipResponse.json();
      health.diagnostics.serverIP = ipData.ip;
      console.log('[Health] Server IP detected:', ipData.ip);
    }
  } catch (error) {
    console.warn('[Health] Failed to detect server IP:', error instanceof Error ? error.message : 'Unknown error');
    health.diagnostics.serverIP = 'Unable to detect';
  }

  try {
    // Check BrickLink API (optional, may be slow)
    const skipBricklinkCheck = process.env.SKIP_BRICKLINK_HEALTH_CHECK === 'true';
    
    console.log('[Health] BrickLink check skipped:', skipBricklinkCheck);
    
    if (!skipBricklinkCheck) {
      console.log('[Health] Testing BrickLink API connection...');
      const client = getBricklinkClient();
      const startTime = Date.now();
      health.checks.bricklink = await client.healthCheck();
      const duration = Date.now() - startTime;
      health.diagnostics.bricklinkCheckDuration = `${duration}ms`;
      console.log('[Health] BrickLink API check result:', health.checks.bricklink, `(${duration}ms)`);
    } else {
      health.checks.bricklink = true; // Assume OK if skipped
      health.diagnostics.bricklinkCheckSkipped = true;
    }
  } catch (error) {
    console.error('[Health] BrickLink health check failed:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    health.diagnostics.bricklinkError = error instanceof Error ? error.message : String(error);
  }

  const allHealthy = Object.values(health.checks).every(check => check === true);
  health.status = allHealthy ? 'ok' : 'degraded';

  return NextResponse.json(health, {
    status: allHealthy ? 200 : 503,
  });
}

