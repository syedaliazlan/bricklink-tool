/**
 * Application configuration
 */

export const appConfig = {
  maxSetsPerJob: parseInt(process.env.NEXT_PUBLIC_MAX_SETS_PER_JOB || '600', 10),
  defaultCurrency: 'GBP',
  cacheTtlHours: parseInt(process.env.CACHE_TTL_HOURS || '24', 10),
  rateLimit: {
    // BrickLink allows 5,000 requests/day (https://www.bricklink.com/v3/terms_of_use_api.page)
    // Optimized for ~20-25 min: 60 requests/min with 3 concurrent sets
    // Each set = 3 calls, so 600 sets = 1,800 requests (well under 5,000/day limit)
    // Processing time: ~30 minutes for 600 sets
    requestsPerMinute: parseInt(process.env.BRICKLINK_RATE_LIMIT_PER_MINUTE || '60', 10),
    concurrentRequests: parseInt(process.env.BRICKLINK_CONCURRENT_REQUESTS || '3', 10),
  },
};

