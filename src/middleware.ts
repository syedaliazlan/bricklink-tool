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
  
  // Check if the primary IP is allowed
  let isAllowed = isIPAllowed(clientIP, allowedIPs);
  
  // If primary IP is IPv6 but not allowed, check if any IPv4 in headers matches
  // This helps when proxies include both IPv4 and IPv6 in headers
  if (!isAllowed && isIPv6(clientIP) && ipv4s.length > 0) {
    logger.debug(`[Middleware] Primary IP ${clientIP} (IPv6) not allowed, checking IPv4 addresses in headers: ${ipv4s.join(', ')}`);
    for (const ipv4 of ipv4s) {
      if (isIPAllowed(ipv4, allowedIPs)) {
        logger.info(`[Middleware] Allowing access via IPv4 ${ipv4} found in headers (connection uses IPv6 ${clientIP})`);
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
        hint = `Your connection is using IPv6 (${clientIP}), but only IPv4 addresses are in the allowed list. You need to add both your IPv4 and IPv6 addresses.`;
        solution = `Add both IPs to ALLOWED_IP_ADDRESSES: your IPv4 address and this IPv6: ${clientIP}`;
      }
    } else if (ipType === 'IPv4' && hasIPv6 && !hasIPv4) {
      hint = `Your connection is using IPv4 (${clientIP}), but only IPv6 addresses are in the allowed list. You need to add both your IPv4 and IPv6 addresses.`;
      solution = `Add both IPs to ALLOWED_IP_ADDRESSES: this IPv4 (${clientIP}) and your IPv6 address`;
    }
    
    // Return a nicely formatted HTML error page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - BrickLink Tool</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        .icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 24px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            margin-bottom: 12px;
            text-align: center;
        }
        .subtitle {
            color: #6b7280;
            text-align: center;
            margin-bottom: 32px;
            font-size: 16px;
        }
        .info-box {
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            padding: 16px;
            margin-bottom: 24px;
            border-radius: 4px;
        }
        .info-box.error {
            border-left-color: #ef4444;
            background: #fef2f2;
        }
        .info-box h3 {
            color: #1f2937;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-box p {
            color: #4b5563;
            font-size: 15px;
            line-height: 1.6;
            margin-bottom: 4px;
        }
        .info-box code {
            background: #e5e7eb;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            color: #1f2937;
        }
        .ip-display {
            background: #1f2937;
            color: #10b981;
            padding: 12px;
            border-radius: 6px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            margin: 12px 0;
            word-break: break-all;
            text-align: center;
        }
        .solution-box {
            background: #ecfdf5;
            border: 1px solid #10b981;
            border-radius: 6px;
            padding: 20px;
            margin-top: 24px;
        }
        .solution-box h3 {
            color: #059669;
            font-size: 16px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .solution-box code {
            background: #1f2937;
            color: #10b981;
            padding: 12px;
            border-radius: 6px;
            display: block;
            margin-top: 12px;
            font-size: 13px;
            word-break: break-all;
        }
        .note {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin-top: 20px;
            border-radius: 4px;
            font-size: 14px;
            color: #92400e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🚫</div>
        <h1>Access Denied</h1>
        <p class="subtitle">Your IP address is not authorized to access this application</p>
        
        <div class="info-box error">
            <h3>Detected Connection</h3>
            <p>Your connection is using <strong>${ipType}</strong></p>
            <div class="ip-display">${clientIP.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${ipv4s.length > 0 ? `<p style="margin-top: 12px;">Also detected IPv4 addresses in headers:</p><div class="ip-display" style="margin-top: 8px;">${ipv4s.map(ip => ip.replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br>')}</div>` : ''}
        </div>

        <div class="info-box">
            <h3>Issue</h3>
            <p>${hint.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>

        <div class="solution-box">
            <h3>✅ Solution</h3>
            <p>${solution.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            ${ipType === 'IPv6' && !hasIPv6 ? `
            <div class="note">
                <strong>Important:</strong> You need to add <strong>both</strong> your IPv4 and IPv6 addresses to the allowed list. 
                Contact the administrator with both IPs to get access.
            </div>
            ` : ''}
        </div>

        <div class="note" style="margin-top: 24px;">
            <strong>Need help?</strong> Contact the application administrator and provide them with your detected IP address(es) above.
        </div>
    </div>
</body>
</html>
    `;

    return new NextResponse(html, {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
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

