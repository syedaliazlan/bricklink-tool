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

  // Try to get server's public IP from multiple sources
  const expectedIP = '149.248.197.193'; // Your Fly.io dedicated IPv4
  health.diagnostics.expectedIP = expectedIP;
  
  try {
    console.log('[Health] Attempting to detect server IP from multiple sources...');
    
    // Try ipify.org
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000),
      });
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        health.diagnostics.serverIP_ipify = ipData.ip;
        health.diagnostics.serverIP = ipData.ip;
        health.diagnostics.ipMatches = ipData.ip === expectedIP;
        console.log('[Health] Server IP detected (ipify):', ipData.ip, 'Expected:', expectedIP, 'Match:', ipData.ip === expectedIP);
      }
    } catch (error) {
      console.warn('[Health] ipify.org failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Try another service as backup
    try {
      const ipResponse2 = await fetch('https://ifconfig.me/ip', {
        signal: AbortSignal.timeout(5000),
      });
      if (ipResponse2.ok) {
        const ipText = await ipResponse2.text();
        const ip = ipText.trim();
        health.diagnostics.serverIP_ifconfig = ip;
        if (!health.diagnostics.serverIP) {
          health.diagnostics.serverIP = ip;
        }
        health.diagnostics.ipMatches = health.diagnostics.ipMatches || (ip === expectedIP);
        console.log('[Health] Server IP detected (ifconfig.me):', ip);
      }
    } catch (error) {
      console.warn('[Health] ifconfig.me failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    if (!health.diagnostics.serverIP) {
      health.diagnostics.serverIP = 'Unable to detect';
      health.diagnostics.ipMatches = false;
    }
  } catch (error) {
    console.warn('[Health] Failed to detect server IP:', error instanceof Error ? error.message : 'Unknown error');
    health.diagnostics.serverIP = 'Unable to detect';
    health.diagnostics.ipMatches = false;
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

