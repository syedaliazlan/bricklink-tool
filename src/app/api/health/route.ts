import { NextRequest, NextResponse } from 'next/server';
import { getBricklinkClient } from '@/lib/bricklink';
import { logger } from '@/lib/utils/logger';

/**
 * Get client IP address from request headers
 */
function getClientIP(request: NextRequest): string | null {
  const flyClientIP = request.headers.get('fly-client-ip');
  if (flyClientIP) return flyClientIP;
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;
  return null;
}

/**
 * Check if request is from an allowed IP or has authorized query parameter
 */
function isAuthorized(request: NextRequest): boolean {
  // Check for authorized query parameter (for monitoring tools)
  const authToken = request.nextUrl.searchParams.get('token');
  const expectedToken = process.env.HEALTH_CHECK_TOKEN;
  if (expectedToken && authToken === expectedToken) {
    return true;
  }

  // Check if IP is in allowed list
  const allowedIPsEnv = process.env.ALLOWED_IP_ADDRESSES || '';
  const allowedIPs = allowedIPsEnv
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);

  if (allowedIPs.length === 0) {
    return false; // No IPs configured, don't show details
  }

  const clientIP = getClientIP(request);
  if (!clientIP) return false;

  // Simple IP check (exact match only for health endpoint)
  return allowedIPs.includes(clientIP);
}

/**
 * GET /api/health
 * Health check endpoint
 * - Public: Basic status only
 * - Authorized (allowed IP or token): Detailed diagnostics
 */
export async function GET(request: NextRequest) {
  const isAuthorizedRequest = isAuthorized(request);
  
  // Basic health response (always shown)
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      bricklink: false,
    },
  };

  // Only include detailed diagnostics for authorized requests
  if (isAuthorizedRequest) {
    health.diagnostics = {
      environment: process.env.NODE_ENV,
      credentials: {
        hasConsumerKey: !!process.env.BRICKLINK_CONSUMER_KEY,
        hasConsumerSecret: !!process.env.BRICKLINK_CONSUMER_SECRET,
        hasToken: !!process.env.BRICKLINK_TOKEN,
        hasTokenSecret: !!process.env.BRICKLINK_TOKEN_SECRET,
      },
      ipRestrictions: {
        enabled: !!process.env.ALLOWED_IP_ADDRESSES,
        allowedIPsCount: process.env.ALLOWED_IP_ADDRESSES?.split(',').filter(ip => ip.trim().length > 0).length || 0,
      },
    };
  }
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

  // Only run detailed diagnostics for authorized requests
  if (isAuthorizedRequest) {
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
      if (health.diagnostics) {
        health.diagnostics.serverIP = 'Unable to detect';
        health.diagnostics.ipMatches = false;
      }
    }
  }

  try {
    // Check BrickLink API (optional, may be slow)
    const skipBricklinkCheck = process.env.SKIP_BRICKLINK_HEALTH_CHECK === 'true';
    
    if (!skipBricklinkCheck) {
      logger.debug('[Health] Testing BrickLink API connection...');
      const client = getBricklinkClient();
      const startTime = Date.now();
      health.checks.bricklink = await client.healthCheck();
      const duration = Date.now() - startTime;
      
      if (isAuthorizedRequest && health.diagnostics) {
        health.diagnostics.bricklinkCheckDuration = `${duration}ms`;
      }
      
      logger.info('[Health] BrickLink API check:', health.checks.bricklink ? 'OK' : 'FAILED', `(${duration}ms)`);
    } else {
      health.checks.bricklink = true; // Assume OK if skipped
      if (isAuthorizedRequest && health.diagnostics) {
        health.diagnostics.bricklinkCheckSkipped = true;
      }
    }
  } catch (error) {
    logger.error('[Health] BrickLink health check failed:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (isAuthorizedRequest && health.diagnostics) {
      health.diagnostics.bricklinkError = error instanceof Error ? error.message : String(error);
    }
  }

  const allHealthy = Object.values(health.checks).every(check => check === true);
  health.status = allHealthy ? 'ok' : 'degraded';

  return NextResponse.json(health, {
    status: allHealthy ? 200 : 503,
  });
}

