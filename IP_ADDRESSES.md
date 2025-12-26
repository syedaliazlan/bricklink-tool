# IP Address Configuration Guide

This document lists all IP addresses that need to be configured for the BrickLink Bulk Pricing Tool.

## Required IP Addresses

### 1. Static Egress IP (Outbound Traffic)
**IP Address**: `209.71.85.254`  
**Purpose**: This is the static egress IP used for all outbound API calls to BrickLink.  
**Where to Configure**:
- **BrickLink API**: Register this IP address in your BrickLink API token settings
- **Fly.io**: Already allocated as static egress IP for the machine
- **Expected Value**: `209.71.85.254`

**Important**: This IP must match the IP registered with your BrickLink API token. If you change this IP, you must:
1. Update your BrickLink API token with the new IP
2. Update the `expectedEgressIP` value in `src/app/api/health/route.ts`

### 2. Dedicated IPv4 (Inbound Traffic - Optional)
**IP Address**: `149.248.197.193`  
**Purpose**: Dedicated IPv4 for inbound traffic (if allocated)  
**Status**: May still be allocated but not required for outbound API calls  
**Note**: This is separate from the egress IP and is used for incoming connections only

### 3. Allowed IP Addresses (Access Control)
**Environment Variable**: `ALLOWED_IP_ADDRESSES`  
**Format**: Comma-separated list of IP addresses or CIDR ranges  
**Purpose**: Restricts API access to specific IP addresses  
**Example Values**:
```
ALLOWED_IP_ADDRESSES=203.0.113.1,198.51.100.0/24,192.0.2.50
```

**Where to Set**:
- **Fly.io**: `flyctl secrets set ALLOWED_IP_ADDRESSES="203.0.113.1,198.51.100.0/24" -a bricklink-tool`
- **Local Development**: Add to `.env` file

**Supported Formats**:
- Single IP: `203.0.113.1`
- CIDR Range: `198.51.100.0/24` (allows all IPs from 198.51.100.0 to 198.51.100.255)

**Important**: 
- If not set, all IPs are allowed (useful for development)
- The health check endpoint (`/api/health`) is always accessible, but detailed diagnostics are only shown to allowed IPs
- Use CIDR notation for IP ranges (e.g., `/24` for a subnet)

## IP Address Summary Table

| IP Address | Type | Purpose | Where Configured | Required |
|------------|------|---------|------------------|----------|
| `209.71.85.254` | Static Egress IP | Outbound API calls to BrickLink | BrickLink API token settings | ✅ Yes |
| `149.248.197.193` | Dedicated IPv4 | Inbound traffic (optional) | Fly.io (if allocated) | ❌ No |
| `ALLOWED_IP_ADDRESSES` | Access Control | Restrict API access | Environment variable | ⚠️ Recommended |

## Verification

### Check Static Egress IP
```bash
# List egress IPs for your Fly.io app
flyctl machine egress-ip list -a bricklink-tool
```

### Verify IP in Health Check
Access the health endpoint from an allowed IP:
```bash
curl https://bricklink-tool.fly.dev/api/health
```

If authorized, the response will include:
```json
{
  "diagnostics": {
    "serverIP": "209.71.85.254",
    "expectedEgressIP": "209.71.85.254",
    "ipMatches": true
  }
}
```

## Troubleshooting

### IP Mismatch Error
If `ipMatches: false` in the health check:
1. Verify the static egress IP: `flyctl machine egress-ip list -a bricklink-tool`
2. Ensure your BrickLink API token is registered with the correct IP
3. Check that the `expectedEgressIP` in `src/app/api/health/route.ts` matches

### Access Denied
If you get "Access Denied" errors:
1. Check your current IP: `curl https://api.ipify.org?format=json`
2. Add your IP to `ALLOWED_IP_ADDRESSES`
3. Restart the Fly.io app: `flyctl apps restart bricklink-tool`

