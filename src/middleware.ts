import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Get client IP address from request headers
 * Fly.io provides the client IP in Fly-Client-IP header (case-insensitive)
 */
function getClientIP(request: NextRequest): string | null {
  // Try multiple header name variations (case-insensitive)
  const headerNames = [
    'fly-client-ip',
    'Fly-Client-IP',
    'FLY-CLIENT-IP',
    'x-forwarded-for',
    'X-Forwarded-For',
    'X-FORWARDED-FOR',
    'x-real-ip',
    'X-Real-IP',
    'X-REAL-IP',
  ];

  for (const headerName of headerNames) {
    const value = request.headers.get(headerName);
    if (value) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip) {
        logger.debug(`[Middleware] Detected IP from header ${headerName}: ${ip}`);
        return ip;
      }
    }
  }

  // Also try to get from all headers (for debugging)
  const allHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  logger.debug('[Middleware] Available headers:', Object.keys(allHeaders));

  return null;
}

/**
 * Check if IP is in the allowed list
 * Supports both exact IPs and CIDR notation (e.g., 192.168.1.0/24)
 */
function isIPAllowed(clientIP: string, allowedIPs: string[]): boolean {
  if (allowedIPs.length === 0) {
    // If no IPs are configured, allow all (for development)
    return true;
  }

  for (const allowed of allowedIPs) {
    // Exact match
    if (clientIP === allowed) {
      return true;
    }

    // CIDR notation support (e.g., 192.168.1.0/24)
    if (allowed.includes('/')) {
      if (isIPInCIDR(clientIP, allowed)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if IP is within a CIDR range
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);
    
    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }

    // Convert to 32-bit integers
    const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const networkNum = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // Get allowed IPs from environment variable (comma-separated)
  const allowedIPsEnv = process.env.ALLOWED_IP_ADDRESSES || '';
  const allowedIPs = allowedIPsEnv
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);

  // If no IPs configured, allow all (useful for development)
  if (allowedIPs.length === 0) {
    logger.debug('[Middleware] No IP restrictions configured, allowing all');
    return NextResponse.next();
  }

  // Get client IP
  const clientIP = getClientIP(request);
  
  if (!clientIP) {
    logger.warn('[Middleware] Could not determine client IP, blocking request');
    return NextResponse.json(
      { error: 'Access denied: Could not verify IP address' },
      { status: 403 }
    );
  }

  // Check if IP is allowed
  const isAllowed = isIPAllowed(clientIP, allowedIPs);

  if (!isAllowed) {
    const ipType = clientIP.includes(':') ? 'IPv6' : 'IPv4';
    const hasIPv4 = allowedIPs.some(ip => !ip.includes(':') && !ip.includes('/'));
    const hasIPv6 = allowedIPs.some(ip => ip.includes(':'));
    
    logger.warn(`[Middleware] Access denied for IP: ${clientIP}`, {
      allowedIPs,
      path: request.nextUrl.pathname,
      clientIP,
      ipType,
      hasIPv4InList: hasIPv4,
      hasIPv6InList: hasIPv6,
    });
    
    let hint = 'Check that your IP matches exactly (including IPv4 vs IPv6)';
    if (ipType === 'IPv6' && hasIPv4 && !hasIPv6) {
      hint = `Your connection is using IPv6 (${clientIP}), but only IPv4 addresses are in the allowed list. Add this IPv6 address to ALLOWED_IP_ADDRESSES, or add both your IPv4 and IPv6 addresses.`;
    } else if (ipType === 'IPv4' && hasIPv6 && !hasIPv4) {
      hint = `Your connection is using IPv4 (${clientIP}), but only IPv6 addresses are in the allowed list. Add this IPv4 address to ALLOWED_IP_ADDRESSES.`;
    }
    
    return NextResponse.json(
      { 
        error: 'Access denied: IP address not authorized',
        detectedIP: clientIP,
        ipType,
        hint,
        solution: ipType === 'IPv6' 
          ? `Add this IPv6 address to ALLOWED_IP_ADDRESSES: ${clientIP}`
          : `Add this IPv4 address to ALLOWED_IP_ADDRESSES: ${clientIP}`
      },
      { status: 403 }
    );
  }

  logger.info(`[Middleware] Access granted for IP: ${clientIP}`, {
    path: request.nextUrl.pathname,
  });

  logger.debug(`[Middleware] Access granted for IP: ${clientIP}`, {
    path: request.nextUrl.pathname,
  });

  return NextResponse.next();
}

// Configure which routes to protect
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/health (health checks should be accessible)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/health|_next/static|_next/image|favicon.ico).*)',
  ],
};

