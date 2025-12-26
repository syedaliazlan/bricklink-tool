# BrickLink Bulk Pricing Tool

A web application for bulk BrickLink price lookups. Upload a CSV or Excel file with set numbers and conditions to retrieve essential pricing metrics from the BrickLink Price Guide API.

![BrickLink Bulk Pricing Tool](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat&logo=tailwindcss)

## Features

- **Bulk Lookups**: Process up to 600 sets at once
- **File Upload**: Upload CSV or Excel files (.csv, .xlsx, .xls) with set numbers and conditions (New/Used)
- **Mixed Conditions**: Process both New and Used sets in a single batch
- **Essential Price Guide Metrics**: 
  - Times Sold (last 6 months)
  - Average Sold Price
  - Items Currently for Sale
  - Average Asking Price
- **Smart Caching**: 24-hour cache reduces API calls
- **CSV Export**: Download results with all essential metrics
- **Pagination**: Navigate large result sets easily with page-local sorting
- **Rate Limiting**: Respects BrickLink API limits (60 requests/min, 5,000/day)
- **HTML Entity Decoding**: Automatically decodes special characters in set names (e.g., `Krennic's` instead of `Krennic&#39;s`)
- **IP-Based Access Control**: Restrict API access to specific IP addresses or CIDR ranges
- **Configurable Logging**: Control log verbosity with environment variables (debug, info, warn, error)
- **Health Check Endpoint**: Monitor application status with public/private diagnostics

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Cache**: In-memory cache with 24-hour TTL
- **API**: BrickLink OAuth 1.0

## Quick Start

### Prerequisites

- Node.js 18+
- BrickLink API credentials

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd bricklink-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Environment Variables

Create a `.env` file in the root directory with your BrickLink API credentials:

**Required:**
```env
BRICKLINK_CONSUMER_KEY=your_consumer_key_here
BRICKLINK_CONSUMER_SECRET=your_consumer_secret_here
BRICKLINK_TOKEN=your_token_here
BRICKLINK_TOKEN_SECRET=your_token_secret_here
```

**Optional configuration:**

```env
# API Rate Limiting
BRICKLINK_RATE_LIMIT_PER_MINUTE=60
BRICKLINK_CONCURRENT_REQUESTS=3

# Access Control (comma-separated IPs or CIDR ranges)
# IMPORTANT: Add both IPv4 and IPv6 addresses for each client
ALLOWED_IP_ADDRESSES=203.0.113.1,2001:db8::1,198.51.100.0/24

# Logging Level (debug, info, warn, error)
LOG_LEVEL=info

# Health Check
SKIP_BRICKLINK_HEALTH_CHECK=false
HEALTH_CHECK_TOKEN=your_secret_token_here

# Cache Configuration
CACHE_TTL_HOURS=24
```

**Environment Variable Reference:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BRICKLINK_CONSUMER_KEY` | ✅ Yes | - | BrickLink API consumer key |
| `BRICKLINK_CONSUMER_SECRET` | ✅ Yes | - | BrickLink API consumer secret |
| `BRICKLINK_TOKEN` | ✅ Yes | - | BrickLink API access token |
| `BRICKLINK_TOKEN_SECRET` | ✅ Yes | - | BrickLink API token secret |
| `ALLOWED_IP_ADDRESSES` | ⚠️ Recommended | - | Comma-separated IPs/CIDR ranges for access control |
| `LOG_LEVEL` | ❌ No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `HEALTH_CHECK_TOKEN` | ❌ No | - | Token for authorized health check access |
| `BRICKLINK_RATE_LIMIT_PER_MINUTE` | ❌ No | `60` | API requests per minute limit |
| `BRICKLINK_CONCURRENT_REQUESTS` | ❌ No | `3` | Maximum concurrent API requests |
| `SKIP_BRICKLINK_HEALTH_CHECK` | ❌ No | `false` | Skip BrickLink API check in health endpoint |
| `CACHE_TTL_HOURS` | ❌ No | `24` | Cache time-to-live in hours |

### Running the Application

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## File Format

The file (CSV or Excel) must contain set numbers and conditions. Examples:

```csv
Set,Condition
75158,new
75142,used
75195,New
```

Or with full format:

```csv
Set Number,Condition
10188-1,new
75192-1,used
10294-1,New
```

**Format Requirements:**
- **Set Number**: Can be numeric (e.g., 75158) or full format (e.g., 10188-1)
- **Column Names**: Flexible - accepts "Set", "Set Number", "Set ID", "ID", etc.
- **Condition**: "new", "used", "New", "Used", "N", or "U" (case-insensitive)
- **Headers**: First row should contain column names (flexible naming supported)

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   │   ├── lookups/       # Bulk lookup endpoints
│   │   └── health/        # Health check
│   ├── page.tsx           # Home page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── SetInput.tsx       # Input form with CSV/Excel upload
│   ├── ResultsTable.tsx   # Results with pagination and sorting
│   └── ProgressIndicator.tsx
├── lib/
│   ├── bricklink/         # BrickLink API client
│   ├── services/          # Business logic & caching
│   └── utils/             # Helpers (formatting, logger)
├── middleware.ts          # IP-based access control
└── types/                 # TypeScript types
```

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

## API Endpoints

| Endpoint | Method | Description | Access Control |
|----------|--------|-------------|----------------|
| `/api/lookups` | POST | Process bulk lookup (synchronous) | IP-restricted (if configured) |
| `/api/health` | GET | Health check (public basic info, authorized full diagnostics) | Public (basic), IP/token (detailed) |

### `/api/lookups`

**Request Body:**
```json
{
  "sets": [
    { "setNumber": "75158", "condition": "new" },
    { "setNumber": "75142", "condition": "used" }
  ],
  "forceRefresh": false
}
```

**Response:**
```json
{
  "results": [
    {
      "setNumber": "75158",
      "setName": "Millennium Falcon",
      "condition": "new",
      "timesSold": 150,
      "averagePrice": 159.99,
      "itemsForSale": 45,
      "averageAskingPrice": 169.99
    }
  ],
  "processedCount": 2,
  "totalCount": 2
}
```

### `/api/health`

**Public Access:**
- Returns basic status and health checks
- No sensitive information exposed

**Authorized Access** (from allowed IP or with `?token=YOUR_TOKEN`):
- Full diagnostics including IP addresses, credential status, and detailed checks
- See [IP_ADDRESSES.md](./IP_ADDRESSES.md) for IP configuration details

## Deployment

### Fly.io (Recommended for Production)

This app is configured for Fly.io deployment with Docker support.

#### Prerequisites

1. Install Fly.io CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `flyctl auth login`
3. Create app: `flyctl apps create bricklink-tool`

#### Initial Setup

1. **Allocate Static Egress IP** (Required for BrickLink API):
   ```bash
   # Get your machine ID
   flyctl machine list -a bricklink-tool
   
   # Allocate static egress IP
   flyctl machine egress-ip allocate <machine-id> -a bricklink-tool -y
   
   # List egress IPs to verify
   flyctl machine egress-ip list -a bricklink-tool
   ```

2. **Register IP with BrickLink**:
   - Note your static egress IP (e.g., `209.71.85.254`)
   - Update your BrickLink API token to allow this IP address
   - See [IP_ADDRESSES.md](./IP_ADDRESSES.md) for details

3. **Set Environment Variables**:
   ```bash
   flyctl secrets set BRICKLINK_CONSUMER_KEY=your_key -a bricklink-tool
   flyctl secrets set BRICKLINK_CONSUMER_SECRET=your_secret -a bricklink-tool
   flyctl secrets set BRICKLINK_TOKEN=your_token -a bricklink-tool
   flyctl secrets set BRICKLINK_TOKEN_SECRET=your_token_secret -a bricklink-tool
   flyctl secrets set ALLOWED_IP_ADDRESSES="203.0.113.1,198.51.100.0/24" -a bricklink-tool
   flyctl secrets set LOG_LEVEL=info -a bricklink-tool
   ```

4. **Deploy**:
   ```bash
   flyctl deploy -a bricklink-tool
   ```

#### Fly.io Configuration

- **Dockerfile**: Multi-stage build with Node.js 20 Alpine
- **Standalone Output**: Next.js configured for standalone deployment
- **Health Checks**: Automatic health monitoring via `/api/health`

**Important Notes:**
- Static egress IP is required for BrickLink API (IP-based authentication)
- The egress IP remains constant once allocated
- Update `expectedEgressIP` in `src/app/api/health/route.ts` if you change the IP

### Other Platforms

This Next.js app can be deployed to:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Railway**
- **Render** (see below)
- Any platform that supports Node.js and Docker

### Render

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Configure build settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables in Render dashboard
6. Deploy!

**Note**: Free tier on Render spins down after 15 minutes of inactivity. Consider upgrading to a paid tier for production use.

## Features in Detail

### Caching

- Results are cached for 24 hours (configurable via `CACHE_TTL_HOURS`)
- Reduces API calls and improves performance
- Use "Force Refresh" option to bypass cache
- Cache is stored in-memory (resets on server restart)

### Rate Limiting

- Automatically respects BrickLink API limits
- 60 requests per minute (configurable via `BRICKLINK_RATE_LIMIT_PER_MINUTE`)
- 3 concurrent requests (configurable via `BRICKLINK_CONCURRENT_REQUESTS`)
- Handles rate limit errors with automatic retries
- Exponential backoff for failed requests

### HTML Entity Decoding

- Automatically decodes HTML entities in set names
- Examples: `&#39;` → `'`, `&quot;` → `"`, `&amp;` → `&`
- Works on both client and server side
- Ensures proper display of special characters

### IP-Based Access Control

- Restrict API access to specific IP addresses
- Supports single IPs and CIDR ranges (e.g., `192.168.1.0/24`)
- **Requires both IPv4 and IPv6 addresses** - clients connecting via IPv6 must have their IPv6 address in the allowed list
- Configure via `ALLOWED_IP_ADDRESSES` environment variable
- Health check endpoint is always accessible (with limited info for unauthorized users)
- Access attempts are logged for security monitoring
- Formatted error page shown when access is denied (instead of JSON)

**Important:** Modern networks often use IPv6. You must add **both** IPv4 and IPv6 addresses for each client to ensure access works regardless of which protocol their connection uses.

**Example Configuration:**
```env
# Single client with both IPv4 and IPv6
ALLOWED_IP_ADDRESSES=203.0.113.1,2001:db8::1

# Multiple clients (each with IPv4 and IPv6)
ALLOWED_IP_ADDRESSES=203.0.113.1,2001:db8::1,198.51.100.50,2001:db8::2

# With CIDR ranges
ALLOWED_IP_ADDRESSES=203.0.113.1,2001:db8::1,198.51.100.0/24
```

**How to Get Client IPs:**
1. **IPv4**: `curl https://api.ipify.org?format=json`
2. **IPv6**: Access the app - the error page will show your IPv6 address, or use: `curl -6 https://api64.ipify.org?format=json`

### Configurable Logging

- Control log verbosity with `LOG_LEVEL` environment variable
- Levels: `debug` (most verbose), `info` (default), `warn`, `error` (least verbose)
- Detailed API request/response logging at `debug` level
- Essential operational logs at `info` level
- Errors and warnings always logged

**Log Level Examples:**
- `LOG_LEVEL=info` - Production default (essential logs only)
- `LOG_LEVEL=debug` - Troubleshooting (full API details)
- `LOG_LEVEL=error` - Minimal logging (errors only)

### Health Check Endpoint

- Public endpoint: `/api/health` (basic status only)
- Authorized access: Full diagnostics for allowed IPs or token-based access
- Checks BrickLink API connectivity
- Verifies server IP matches expected egress IP
- Includes credential status (without exposing values)

**Public Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-26T02:30:02.235Z",
  "checks": {
    "bricklink": true
  }
}
```

**Authorized Response** (includes diagnostics):
- Server IP addresses
- IP matching status
- Credential configuration status
- API check duration
- IP restriction status

### Error Handling

- Invalid set numbers are clearly marked
- API errors are logged and displayed
- Graceful degradation for partial failures
- Detailed error messages for troubleshooting
- Automatic retry for transient failures

## Troubleshooting

### "BrickLink API credentials are missing"

- Ensure `.env` file exists in project root (or secrets set in Fly.io)
- Verify all 4 credentials are set correctly
- Restart dev server after creating/editing `.env`
- Check logs for credential status: `LOG_LEVEL=debug`

### BrickLink API Not Working (IP Mismatch)

- **Symptom**: API calls fail with authentication errors
- **Cause**: Outbound IP doesn't match registered IP in BrickLink token
- **Solution**:
  1. Check your static egress IP: `flyctl machine egress-ip list -a bricklink-tool`
  2. Verify IP in health check: `curl https://bricklink-tool.fly.dev/api/health` (from allowed IP)
  3. Update BrickLink API token with the correct static egress IP
  4. Update `expectedEgressIP` in `src/app/api/health/route.ts` if changed

### Access Denied (403 Forbidden)

- **Symptom**: "Access Denied: IP address not authorized" (formatted HTML error page)
- **Cause**: Your IP is not in the `ALLOWED_IP_ADDRESSES` list, or you're missing IPv6 address
- **Solution**:
  1. **Get your IPv4**: `curl https://api.ipify.org?format=json`
  2. **Get your IPv6**: The error page will show it, or use: `curl -6 https://api64.ipify.org?format=json`
  3. **Add both IPs** to `ALLOWED_IP_ADDRESSES`:
     ```bash
     flyctl secrets set ALLOWED_IP_ADDRESSES="YOUR_IPv4,YOUR_IPv6" -a bricklink-tool
     ```
  4. The app will automatically detect and use the correct IP based on your connection
  5. For development, you can temporarily remove IP restrictions by unsetting the variable

**Common Issue:** If you only added your IPv4 but your connection uses IPv6, you'll be denied access. Always add both addresses.

### File parsing errors

- Ensure file has headers (Set, Set Number, Condition, etc.)
- Check set numbers are numeric or full format
- Verify conditions are: new, used, New, Used, N, or U

### Rate limit errors

- This is normal if processing many sets
- Wait 1 minute and try again
- Reduce `BRICKLINK_CONCURRENT_REQUESTS` if needed
- Check logs for rate limit details: `LOG_LEVEL=debug`

### Health Check Shows IP Mismatch

- **Symptom**: `ipMatches: false` in health check response
- **Solution**:
  1. Verify static egress IP matches BrickLink token registration
  2. Update `expectedEgressIP` in `src/app/api/health/route.ts` if needed
  3. Ensure BrickLink API token is registered with the correct IP

### Excessive Logging

- **Symptom**: Too many logs in production
- **Solution**: Set `LOG_LEVEL=info` (or `warn`/`error` for minimal logging)
- Use `LOG_LEVEL=debug` only when troubleshooting

## Security Notes

- **Never commit `.env` files** - They are in `.gitignore`
- **Never expose API credentials** in code or documentation
- Use environment variables for all sensitive data
- Rotate credentials if accidentally exposed
- **IP-Based Access Control**: Restrict API access to trusted IPs in production
- **Health Check Security**: Detailed diagnostics only shown to authorized requests
- **Logging**: Sensitive data (credentials, tokens) are never logged, only presence is indicated
- **Static Egress IP**: Required for BrickLink API - ensure IP matches registered token IP

### IP Address Configuration

For detailed IP address configuration, see [IP_ADDRESSES.md](./IP_ADDRESSES.md).

**Quick Reference:**
- **Static Egress IP**: `209.71.85.254` (must match BrickLink API token registration)
- **Allowed IPs**: Configure via `ALLOWED_IP_ADDRESSES` environment variable
- **Health Check Token**: Optional token for monitoring tools (set via `HEALTH_CHECK_TOKEN`)

## License

Private - Internal Use Only
