import { NextResponse } from 'next/server';
import { getBricklinkClient } from '@/lib/bricklink';
import { logger } from '@/lib/utils/logger';

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
      ipRestrictions: {
        enabled: !!process.env.ALLOWED_IP_ADDRESSES,
        allowedIPsCount: process.env.ALLOWED_IP_ADDRESSES?.split(',').filter(ip => ip.trim().length > 0).length || 0,
      },
    },
  };

  // Try to get server's public IP from multiple sources
  const expectedEgressIP = '209.71.85.254'; // Your Fly.io static egress IPv4
  health.diagnostics.expectedEgressIP = expectedEgressIP;
  
  try {
    logger.debug('[Health] Attempting to detect server IP from multiple sources...');
    
    // Try ipify.org
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000),
      });
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        health.diagnostics.serverIP_ipify = ipData.ip;
        health.diagnostics.serverIP = ipData.ip;
        health.diagnostics.ipMatches = ipData.ip === expectedEgressIP;
        logger.debug('[Health] Server IP detected (ipify):', ipData.ip, 'Expected:', expectedEgressIP, 'Match:', ipData.ip === expectedEgressIP);
      }
    } catch (error) {
      logger.debug('[Health] ipify.org failed:', error instanceof Error ? error.message : 'Unknown error');
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
        health.diagnostics.ipMatches = health.diagnostics.ipMatches || (ip === expectedEgressIP);
        logger.debug('[Health] Server IP detected (ifconfig.me):', ip);
      }
    } catch (error) {
      logger.debug('[Health] ifconfig.me failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    if (!health.diagnostics.serverIP) {
      health.diagnostics.serverIP = 'Unable to detect';
      health.diagnostics.ipMatches = false;
    }
  } catch (error) {
    logger.warn('[Health] Failed to detect server IP:', error instanceof Error ? error.message : 'Unknown error');
    health.diagnostics.serverIP = 'Unable to detect';
    health.diagnostics.ipMatches = false;
  }

  try {
    // Check BrickLink API (optional, may be slow)
    const skipBricklinkCheck = process.env.SKIP_BRICKLINK_HEALTH_CHECK === 'true';
    
    logger.debug('[Health] BrickLink check skipped:', skipBricklinkCheck);
    
    if (!skipBricklinkCheck) {
      logger.debug('[Health] Testing BrickLink API connection...');
      const client = getBricklinkClient();
      const startTime = Date.now();
      health.checks.bricklink = await client.healthCheck();
      const duration = Date.now() - startTime;
      health.diagnostics.bricklinkCheckDuration = `${duration}ms`;
      logger.info('[Health] BrickLink API check:', health.checks.bricklink ? 'OK' : 'FAILED', `(${duration}ms)`);
    } else {
      health.checks.bricklink = true; // Assume OK if skipped
      health.diagnostics.bricklinkCheckSkipped = true;
    }
  } catch (error) {
    logger.error('[Health] BrickLink health check failed:', {
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

