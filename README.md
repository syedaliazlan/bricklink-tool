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

```env
BRICKLINK_CONSUMER_KEY=your_consumer_key_here
BRICKLINK_CONSUMER_SECRET=your_consumer_secret_here
BRICKLINK_TOKEN=your_token_here
BRICKLINK_TOKEN_SECRET=your_token_secret_here
```

**Optional configuration:**

```env
BRICKLINK_RATE_LIMIT_PER_MINUTE=60
BRICKLINK_CONCURRENT_REQUESTS=3
SKIP_BRICKLINK_HEALTH_CHECK=false
```

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
│   └── utils/             # Helpers
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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lookups` | POST | Process bulk lookup (synchronous) |
| `/api/health` | GET | Health check |

## Deployment

### Render

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Configure build settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables in Render dashboard:
   - `BRICKLINK_CONSUMER_KEY`
   - `BRICKLINK_CONSUMER_SECRET`
   - `BRICKLINK_TOKEN`
   - `BRICKLINK_TOKEN_SECRET`
   - `NODE_ENV=production`
6. Deploy!

**Note**: Free tier on Render spins down after 15 minutes of inactivity. Consider upgrading to a paid tier for production use.

### Other Platforms

This Next.js app can be deployed to:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Railway**
- Any platform that supports Node.js

## Features in Detail

### Caching

- Results are cached for 24 hours
- Reduces API calls and improves performance
- Use "Force Refresh" option to bypass cache

### Rate Limiting

- Automatically respects BrickLink API limits
- 60 requests per minute (configurable)
- 3 concurrent requests (configurable)
- Handles rate limit errors with automatic retries

### Error Handling

- Invalid set numbers are clearly marked
- API errors are logged and displayed
- Graceful degradation for partial failures

## Troubleshooting

### "BrickLink API credentials are missing"

- Ensure `.env` file exists in project root
- Verify all 4 credentials are set correctly
- Restart dev server after creating/editing `.env`

### File parsing errors

- Ensure file has headers (Set, Set Number, Condition, etc.)
- Check set numbers are numeric or full format
- Verify conditions are: new, used, New, Used, N, or U

### Rate limit errors

- This is normal if processing many sets
- Wait 1 minute and try again
- Reduce `BRICKLINK_CONCURRENT_REQUESTS` if needed

## Security Notes

- **Never commit `.env` files** - They are in `.gitignore`
- **Never expose API credentials** in code or documentation
- Use environment variables for all sensitive data
- Rotate credentials if accidentally exposed

## License

Private - Internal Use Only
