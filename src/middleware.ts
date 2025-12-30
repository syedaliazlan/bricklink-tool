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
  return ip.includes(':') && !ip.includes('.');
}

/**
 * Extract IPv6 prefix for /64 CIDR notation
 * Takes the first 4 groups of the IPv6 address
 */
function getIPv6Prefix(ipv6: string): string {
  try {
    // Handle :: expansion first
    const expanded = expandIPv6(ipv6);
    if (!expanded) return '';
    
    // Take first 4 groups (64 bits) and format as CIDR
    const prefix = expanded.slice(0, 4).join(':');
    return `${prefix}::/64`;
  } catch {
    return '';
  }
}

/**
 * Expand IPv6 address to full 8-group format
 */
function expandIPv6(ip: string): string[] | null {
  try {
    // Remove any zone identifier (e.g., %eth0)
    const cleanIP = ip.split('%')[0];
    
    let groups: string[];
    
    if (cleanIP.includes('::')) {
      const parts = cleanIP.split('::');
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missingGroups = 8 - left.length - right.length;
      
      groups = [
        ...left,
        ...Array(missingGroups).fill('0'),
        ...right,
      ];
    } else {
      groups = cleanIP.split(':');
    }
    
    if (groups.length !== 8) {
      return null;
    }
    
    // Normalize each group to lowercase (don't pad, keep original for comparison)
    return groups.map(g => g.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * Check if IPv6 is within a CIDR range
 */
function isIPv6InCIDR(ip: string, network: string, prefixLength: number): boolean {
  try {
    const ipGroups = expandIPv6(ip);
    const networkGroups = expandIPv6(network);
    
    if (!ipGroups || !networkGroups) {
      return false;
    }
    
    // Convert each group to 16-bit binary and concatenate
    const ipBinary = ipGroups
      .map(g => parseInt(g, 16).toString(2).padStart(16, '0'))
      .join('');
    const networkBinary = networkGroups
      .map(g => parseInt(g, 16).toString(2).padStart(16, '0'))
      .join('');
    
    // Compare the first prefixLength bits
    return ipBinary.substring(0, prefixLength) === networkBinary.substring(0, prefixLength);
  } catch {
    return false;
  }
}

/**
 * Check if IPv4 is within a CIDR range
 */
function isIPv4InCIDR(ip: string, network: string, prefixLength: number): boolean {
  try {
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);
    
    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }

    // Convert to 32-bit integers
    const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const networkNum = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
    const mask = (0xffffffff << (32 - prefixLength)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  } catch {
    return false;
  }
}

/**
 * Check if IP is within a CIDR range (supports both IPv4 and IPv6)
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, prefixLengthStr] = cidr.split('/');
    const prefixLength = parseInt(prefixLengthStr, 10);
    
    if (isNaN(prefixLength)) {
      return false;
    }
    
    // Check if both IP and CIDR are the same type
    const ipIsV6 = isIPv6(ip);
    const cidrIsV6 = isIPv6(network);
    
    if (ipIsV6 !== cidrIsV6) {
      return false; // Can't compare IPv4 with IPv6
    }
    
    if (ipIsV6) {
      return isIPv6InCIDR(ip, network, prefixLength);
    } else {
      return isIPv4InCIDR(ip, network, prefixLength);
    }
  } catch {
    return false;
  }
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
  const { primary, ipv4s } = getAllIPs(request);
  
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
 * Supports both exact IPs and CIDR notation (e.g., 192.168.1.0/24 or 2a00:23c8::/32)
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

    // CIDR notation support (e.g., 192.168.1.0/24 or 2a00:23c8::/64)
    if (allowed.includes('/')) {
      if (isIPInCIDR(clientIP, allowed)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate the Access Denied HTML page
 */
function generateAccessDeniedPage(
  clientIP: string,
  ipType: 'IPv4' | 'IPv6',
  ipv4s: string[],
  ipv6Prefix: string
): string {
  return `
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
            max-width: 650px;
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
            margin-bottom: 20px;
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
            border-radius: 8px;
            padding: 24px;
            margin-top: 24px;
        }
        .solution-box h3 {
            color: #059669;
            font-size: 18px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .solution-item {
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #d1fae5;
        }
        .solution-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        .solution-item h4 {
            color: #047857;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .solution-item p {
            color: #065f46;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .solution-item code {
            background: #1f2937;
            color: #10b981;
            padding: 10px 14px;
            border-radius: 6px;
            display: block;
            font-size: 13px;
            word-break: break-all;
            margin-top: 8px;
        }
        .copy-text {
            background: #f0fdf4;
            border: 2px dashed #10b981;
            border-radius: 6px;
            padding: 16px;
            margin-top: 20px;
        }
        .copy-text h4 {
            color: #047857;
            font-size: 14px;
            margin-bottom: 12px;
        }
        .copy-text pre {
            background: #1f2937;
            color: #fbbf24;
            padding: 12px;
            border-radius: 6px;
            font-size: 13px;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .note {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px 16px;
            margin-top: 20px;
            border-radius: 4px;
            font-size: 14px;
            color: #92400e;
        }
        .note a {
            color: #d97706;
            font-weight: 600;
        }
        .divider {
            height: 1px;
            background: #e5e7eb;
            margin: 24px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🚫</div>
        <h1>Access Denied</h1>
        <p class="subtitle">Your IP address is not authorized to access this application</p>
        
        <div class="info-box error">
            <h3>Your Detected Connection</h3>
            <p>Your connection is using <strong>${ipType}</strong></p>
            <div class="ip-display">${escapeHtml(clientIP)}</div>
        </div>

        <div class="solution-box">
            <h3>✅ Request Access - Send These Details</h3>
            
            <p style="color: #065f46; margin-bottom: 20px;">
                Please send the following information to your administrator to get access:
            </p>

            ${ipType === 'IPv6' ? `
            <div class="solution-item">
                <h4>1. Your IPv6 Network Prefix</h4>
                <p>This covers all your IPv6 addresses (the suffix changes, but prefix stays constant):</p>
                <code>${escapeHtml(ipv6Prefix)}</code>
            </div>

            <div class="solution-item">
                <h4>2. Your IPv4 Address</h4>
                ${ipv4s.length > 0 ? `
                <p>We detected this IPv4 in your connection:</p>
                <code>${escapeHtml(ipv4s[0])}</code>
                ` : `
                <p>We couldn't detect your IPv4 address. Please visit this link to find it:</p>
                <p><a href="https://api.ipify.org" target="_blank" style="color: #059669; font-weight: 600;">https://api.ipify.org</a></p>
                <p style="margin-top: 8px; color: #6b7280; font-size: 13px;">Copy the IP address shown on that page.</p>
                `}
            </div>

            <div class="copy-text">
                <h4>📋 Copy & Send This to Administrator:</h4>
                <pre>IPv4: ${ipv4s.length > 0 ? escapeHtml(ipv4s[0]) : '[Visit https://api.ipify.org to get your IPv4]'}
IPv6 Prefix: ${escapeHtml(ipv6Prefix)}</pre>
            </div>
            ` : `
            <div class="solution-item">
                <h4>Your IPv4 Address</h4>
                <p>Send this to your administrator:</p>
                <code>${escapeHtml(clientIP)}</code>
            </div>

            <div class="copy-text">
                <h4>📋 Copy & Send This to Administrator:</h4>
                <pre>IPv4: ${escapeHtml(clientIP)}</pre>
            </div>
            `}
        </div>

        <div class="note">
            <strong>Why both IPv4 and IPv6?</strong> Your internet connection may use either protocol depending on your network. 
            Providing both ensures uninterrupted access.
        </div>
    </div>
</body>
</html>
  `;
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
    return new NextResponse(
      generateAccessDeniedPage('Unknown', 'IPv4', [], ''),
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
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
    const ipv6Prefix = ipType === 'IPv6' ? getIPv6Prefix(clientIP) : '';
    
    logger.warn(`[Middleware] Access denied for IP: ${clientIP}`, {
      allowedIPs,
      path: request.nextUrl.pathname,
      clientIP,
      allDetectedIPs: allIPs,
      detectedIPv4s: ipv4s,
      ipType,
      ipv6Prefix,
    });

    return new NextResponse(
      generateAccessDeniedPage(clientIP, ipType, ipv4s, ipv6Prefix),
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  logger.info(`[Middleware] Access granted for IP: ${clientIP}`, {
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
