import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Check if an IP address is IPv4
 */
function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Check if an IP address is IPv6
 */
function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

/**
 * Get all IP addresses from request headers
 * Returns both the primary IP and all IPs found in headers
 */
function getAllIPs(request: NextRequest): { primary: string | null; allIPs: string[]; ipv4s: string[] } {
  const allIPs: string[] = [];
  const ipv4s: string[] = [];
  let primaryIP: string | null = null;

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
      // X-Forwarded-For can contain multiple IPs
      const ips = value.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
      for (const ip of ips) {
        if (!allIPs.includes(ip)) {
          allIPs.push(ip);
          if (isIPv4(ip)) {
            ipv4s.push(ip);
          }
          // Set primary IP from Fly-Client-IP if available, otherwise first IP
          if (!primaryIP && (headerName.toLowerCase().includes('fly-client-ip') || !primaryIP)) {
            primaryIP = ip;
          }
        }
      }
    }
  }

  // If no primary IP set, use first one found
  if (!primaryIP && allIPs.length > 0) {
    primaryIP = allIPs[0];
  }

  return { primary: primaryIP, allIPs, ipv4s };
}

/**
 * Get client IP address from request headers
 * Prefers IPv4 if available, otherwise returns primary IP
 */
function getClientIP(request: NextRequest): string | null {
  const { primary, allIPs, ipv4s } = getAllIPs(request);
  
  // Prefer IPv4 if available
  if (ipv4s.length > 0) {
    logger.debug(`[Middleware] Found IPv4 addresses: ${ipv4s.join(', ')}, using first: ${ipv4s[0]}`);
    return ipv4s[0];
  }
  
  // Otherwise return primary IP
  if (primary) {
    logger.debug(`[Middleware] Using primary IP: ${primary} (${isIPv6(primary) ? 'IPv6' : 'IPv4'})`);
    return primary;
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

  // Get all IPs from headers (including IPv4 if available)
  const { allIPs, ipv4s } = getAllIPs(request);
  
  // Check if any IP (primary or IPv4) is allowed
  // This allows clients to add IPv4 even if connection uses IPv6
  let isAllowed = isIPAllowed(clientIP, allowedIPs);
  
  // If primary IP is IPv6 but not allowed, check if any IPv4 in headers matches
  if (!isAllowed && isIPv6(clientIP) && ipv4s.length > 0) {
    logger.debug(`[Middleware] Primary IP ${clientIP} (IPv6) not allowed, checking IPv4 addresses: ${ipv4s.join(', ')}`);
    for (const ipv4 of ipv4s) {
      if (isIPAllowed(ipv4, allowedIPs)) {
        logger.info(`[Middleware] Allowing access via IPv4 ${ipv4} (connection uses IPv6 ${clientIP})`);
        isAllowed = true;
        break;
      }
    }
  }

  if (!isAllowed) {
    const ipType = isIPv6(clientIP) ? 'IPv6' : 'IPv4';
    const hasIPv4 = allowedIPs.some(ip => isIPv4(ip) && !ip.includes('/'));
    const hasIPv6 = allowedIPs.some(ip => isIPv6(ip));
    
    logger.warn(`[Middleware] Access denied for IP: ${clientIP}`, {
      allowedIPs,
      path: request.nextUrl.pathname,
      clientIP,
      allDetectedIPs: allIPs,
      detectedIPv4s: ipv4s,
      ipType,
      hasIPv4InList: hasIPv4,
      hasIPv6InList: hasIPv6,
    });
    
    let hint = 'Check that your IP matches exactly (including IPv4 vs IPv6)';
    let solution = `Add this ${ipType} address to ALLOWED_IP_ADDRESSES: ${clientIP}`;
    
    if (ipType === 'IPv6' && hasIPv4 && !hasIPv6) {
      if (ipv4s.length > 0) {
        hint = `Your connection uses IPv6, but we found IPv4 addresses in headers: ${ipv4s.join(', ')}. However, none match your allowed IPv4 addresses.`;
        solution = `Add one of these IPv4 addresses to ALLOWED_IP_ADDRESSES: ${ipv4s.join(' or ')}`;
      } else {
        hint = `Your connection is using IPv6 (${clientIP}), but only IPv4 addresses are in the allowed list. The app prefers IPv4 - if your network supports it, try connecting via IPv4, or add this IPv6 address.`;
        solution = `Add this IPv6 address to ALLOWED_IP_ADDRESSES: ${clientIP}`;
      }
    } else if (ipType === 'IPv4' && hasIPv6 && !hasIPv4) {
      hint = `Your connection is using IPv4 (${clientIP}), but only IPv6 addresses are in the allowed list. Add this IPv4 address to ALLOWED_IP_ADDRESSES.`;
    }
    
    return NextResponse.json(
      { 
        error: 'Access denied: IP address not authorized',
        detectedIP: clientIP,
        detectedIPv4s: ipv4s.length > 0 ? ipv4s : undefined,
        allDetectedIPs: allIPs.length > 1 ? allIPs : undefined,
        ipType,
        hint,
        solution
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

