import { OAuth1 } from './oauth';
import type {
  BricklinkConfig,
  BricklinkApiResponse,
  BricklinkError,
  PriceGuideParams,
  PriceGuideData,
  RateLimitConfig,
} from './types';

/**
 * BrickLink API Client
 * Handles OAuth 1.0 authentication, rate limiting, and retries
 */
export class BricklinkClient {
  private config: Required<BricklinkConfig>;
  private oauth: OAuth1;
  private rateLimit: RateLimitConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;
  private requestTimestamps: number[] = [];

  constructor(config: BricklinkConfig, rateLimit?: Partial<RateLimitConfig>) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://api.bricklink.com/api/store/v1',
    };

    this.oauth = new OAuth1(config.consumerSecret, config.tokenSecret);

    // BrickLink API limits: 5,000 requests per day (from https://www.bricklink.com/v3/terms_of_use_api.page)
    // Each set requires 3 API calls (sold, stock, item)
    // For 600 sets: 600 × 3 = 1,800 requests (well under 5,000/day)
    // Optimized for ~20-25 min processing: 60 requests/min with 3 concurrent sets
    // This processes ~20 sets/min = 600 sets in ~30 minutes, staying well under daily limit
    this.rateLimit = {
      requestsPerMinute: rateLimit?.requestsPerMinute || 60, // 60 requests/min for safe fast processing, 1,800 requests total is safe
      concurrentRequests: rateLimit?.concurrentRequests || 3, // Process 3 sets concurrently (each makes 3 sequential calls)
    };
    
    // Initialize empty timestamps array
    this.requestTimestamps = [];
    this.activeRequests = 0;
  }

  /**
   * Make authenticated request to BrickLink API
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    queryParams: Record<string, string> = {},
    body?: any
  ): Promise<T> {
    // Build full URL
    const url = `${this.config.baseUrl}${endpoint}`;
    const urlWithParams = queryParams
      ? `${url}?${new URLSearchParams(queryParams).toString()}`
      : url;

    // Log request details
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[BrickLink API] [${requestId}] Starting request:`, {
      method,
      endpoint,
      url: urlWithParams,
      queryParams,
      hasBody: !!body,
      timestamp: new Date().toISOString(),
    });

    // Generate OAuth header
    const authHeader = this.oauth.buildAuthorizationHeader(
      method,
      url,
      this.config.consumerKey,
      this.config.token,
      queryParams
    );

    // Log OAuth details (without exposing secrets)
    console.log(`[BrickLink API] [${requestId}] OAuth details:`, {
      consumerKey: this.config.consumerKey ? `${this.config.consumerKey.substring(0, 4)}...` : 'MISSING',
      token: this.config.token ? `${this.config.token.substring(0, 4)}...` : 'MISSING',
      authHeaderLength: authHeader.length,
      authHeaderPreview: authHeader.substring(0, 100) + '...',
    });

    // Make request with retry logic
    const maxRetries = 3;
    let lastError: Error | null = null;
    let requestStarted = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Wait if rate limit would be exceeded (also records timestamp)
        // Only record timestamp once per request attempt
        if (!requestStarted) {
          await this.waitForRateLimit();
          requestStarted = true;
        }

        console.log(`[BrickLink API] [${requestId}] Attempt ${attempt + 1}/${maxRetries} - Making fetch request...`);

        const fetchStartTime = Date.now();
        let response: Response;
        
        try {
          response = await fetch(urlWithParams, {
            method,
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
          });
        } catch (fetchError) {
          console.error(`[BrickLink API] [${requestId}] Fetch error (network level):`, {
            error: fetchError instanceof Error ? fetchError.message : String(fetchError),
            errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
            stack: fetchError instanceof Error ? fetchError.stack : undefined,
          });
          throw fetchError;
        }

        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`[BrickLink API] [${requestId}] Response received:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          duration: `${fetchDuration}ms`,
          headers: Object.fromEntries(response.headers.entries()),
        });

        // Mark request as complete
        this.recordRequestComplete();
        requestStarted = false; // Reset for next retry if needed

        // Read response body (for both success and error cases)
        let responseBody: any;
        const contentType = response.headers.get('content-type') || '';
        
        try {
          if (contentType.includes('application/json')) {
            const text = await response.text();
            console.log(`[BrickLink API] [${requestId}] Response body (raw):`, text.substring(0, 500));
            responseBody = text ? JSON.parse(text) : null;
          } else {
            const text = await response.text();
            console.log(`[BrickLink API] [${requestId}] Response body (non-JSON):`, text.substring(0, 500));
            responseBody = { raw: text };
          }
        } catch (parseError) {
          console.error(`[BrickLink API] [${requestId}] Failed to parse response body:`, {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            contentType,
          });
          responseBody = { parseError: parseError instanceof Error ? parseError.message : String(parseError) };
        }

        if (!response.ok) {
          console.error(`[BrickLink API] [${requestId}] API error response:`, {
            status: response.status,
            statusText: response.statusText,
            body: responseBody,
            meta: responseBody?.meta,
            error: responseBody?.error,
          });
          
          // Handle rate limit errors with backoff
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
            console.warn(`[BrickLink API] [${requestId}] Rate limited (429), retrying after ${retryAfter}s`);
            await this.sleep(retryAfter * 1000);
            requestStarted = false; // Allow new timestamp on retry
            continue;
          }

          // Handle server errors with backoff
          if (response.status >= 500) {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.warn(`[BrickLink API] [${requestId}] Server error (${response.status}), retrying after ${Math.round(backoff / 1000)}s`);
            await this.sleep(backoff);
            requestStarted = false; // Allow new timestamp on retry
            continue;
          }

          // Client errors - don't retry
          const errorMessage = responseBody?.meta?.message || responseBody?.error?.message || responseBody?.message || response.statusText;
          const errorDetails = {
            status: response.status,
            statusText: response.statusText,
            message: errorMessage,
            fullResponse: responseBody,
          };
          
          console.error(`[BrickLink API] [${requestId}] Client error (no retry):`, errorDetails);
          throw new Error(
            `BrickLink API error: ${response.status} - ${errorMessage}`
          );
        }

        console.log(`[BrickLink API] [${requestId}] Success! Response data:`, {
          hasData: !!responseBody?.data,
          dataType: typeof responseBody?.data,
          dataPreview: responseBody?.data ? JSON.stringify(responseBody.data).substring(0, 200) : 'null',
        });

        const data: BricklinkApiResponse<T> = responseBody;
        return data.data;

      } catch (error) {
        // Mark request as complete even on error
        if (requestStarted) {
          this.recordRequestComplete();
          requestStarted = false;
        }
        
        lastError = error as Error;
        
        console.error(`[BrickLink API] [${requestId}] Request failed (attempt ${attempt + 1}/${maxRetries}):`, {
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        // Don't retry on network errors if it's the last attempt
        if (attempt < maxRetries - 1) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.warn(`[BrickLink API] [${requestId}] Retrying after ${Math.round(backoff / 1000)}s...`);
          await this.sleep(backoff);
        }
      }
    }

    console.error(`[BrickLink API] [${requestId}] All retries exhausted. Final error:`, {
      error: lastError instanceof Error ? lastError.message : String(lastError),
      stack: lastError instanceof Error ? lastError.stack : undefined,
    });

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Get price guide for an item (sold items)
   */
  async getPriceGuideSold(params: PriceGuideParams): Promise<PriceGuideData> {
    const { itemType, itemNo, condition, currency, region, vat } = params;
    
    const queryParams: Record<string, string> = {
      guide_type: 'sold',
    };
    
    if (condition) queryParams.new_or_used = condition;
    if (currency) queryParams.currency_code = currency;
    if (region) queryParams.region = region;
    if (vat) queryParams.vat = vat;

    return this.makeRequest<PriceGuideData>(
      'GET',
      `/items/${itemType}/${itemNo}/price`,
      queryParams
    );
  }

  /**
   * Get price guide for an item (current stock)
   */
  async getPriceGuideStock(params: PriceGuideParams): Promise<PriceGuideData> {
    const { itemType, itemNo, condition, currency, region, vat } = params;
    
    const queryParams: Record<string, string> = {
      guide_type: 'stock',
    };
    
    if (condition) queryParams.new_or_used = condition;
    if (currency) queryParams.currency_code = currency;
    if (region) queryParams.region = region;
    if (vat) queryParams.vat = vat;

    return this.makeRequest<PriceGuideData>(
      'GET',
      `/items/${itemType}/${itemNo}/price`,
      queryParams
    );
  }

  /**
   * Get item catalog info
   */
  async getItem(itemType: string, itemNo: string): Promise<any> {
    return this.makeRequest('GET', `/items/${itemType}/${itemNo}`);
  }

  /**
   * Rate limiting: wait if we've exceeded requests per minute
   * BrickLink allows 5,000 requests per day (https://www.bricklink.com/v3/terms_of_use_api.page)
   * We use 60 requests/min for safe fast batch processing
   * For 600 sets (1,800 requests), this completes in ~30 minutes, well under daily limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Calculate minimum time between requests to stay under limit
    // For 60 requests/min, that's 1 request per second (1000ms)
    const minTimeBetweenRequests = 60000 / this.rateLimit.requestsPerMinute; // e.g., 1000ms for 60/min
    
    // If we have recent requests, ensure we wait at least minTimeBetweenRequests
    if (this.requestTimestamps.length > 0) {
      const lastRequest = this.requestTimestamps[this.requestTimestamps.length - 1];
      const timeSinceLastRequest = now - lastRequest;
      
      if (timeSinceLastRequest < minTimeBetweenRequests) {
        const waitTime = minTimeBetweenRequests - timeSinceLastRequest;
        await this.sleep(waitTime);
        // Update now after waiting
        const nowAfterWait = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > nowAfterWait - 60000);
      }
    }

    // Wait if we've hit the rate limit (safety check)
    if (this.requestTimestamps.length >= this.rateLimit.requestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // +100ms buffer
      
      if (waitTime > 0) {
        console.warn(`[BrickLink API] Rate limit reached (${this.requestTimestamps.length}/${this.rateLimit.requestsPerMinute} requests/min), waiting ${Math.round(waitTime / 1000)}s`);
        await this.sleep(waitTime);
        // Clean up again after waiting
        const nowAfterWait = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > nowAfterWait - 60000);
      }
    }

    // Wait if we've hit concurrent request limit
    while (this.activeRequests >= this.rateLimit.concurrentRequests) {
      await this.sleep(100);
    }

    // Record timestamp BEFORE making request to prevent race conditions
    const timestamp = Date.now();
    this.requestTimestamps.push(timestamp);
    this.activeRequests++;
  }

  /**
   * Record that a request has completed
   */
  private recordRequestComplete(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to fetch a known item to verify credentials
      await this.getItem('SET', '10188-1');
      return true;
    } catch (error) {
      console.error('[BrickLink API] Health check failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let client: BricklinkClient | null = null;

export function getBricklinkClient(): BricklinkClient {
  if (!client) {
    // Read credentials from environment variables only
    const consumerKey = process.env.BRICKLINK_CONSUMER_KEY;
    const consumerSecret = process.env.BRICKLINK_CONSUMER_SECRET;
    const token = process.env.BRICKLINK_TOKEN;
    const tokenSecret = process.env.BRICKLINK_TOKEN_SECRET;

    // Log credential status (without exposing values)
    console.log('[BrickLink API] Initializing client with credentials:', {
      consumerKey: consumerKey ? `${consumerKey.substring(0, 4)}...${consumerKey.length} chars` : 'MISSING',
      consumerSecret: consumerSecret ? `${consumerSecret.substring(0, 4)}...${consumerSecret.length} chars` : 'MISSING',
      token: token ? `${token.substring(0, 4)}...${token.length} chars` : 'MISSING',
      tokenSecret: tokenSecret ? `${tokenSecret.substring(0, 4)}...${tokenSecret.length} chars` : 'MISSING',
      nodeEnv: process.env.NODE_ENV,
      hasAllCredentials: !!(consumerKey && consumerSecret && token && tokenSecret),
    });

    if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
      const missing = [];
      if (!consumerKey) missing.push('BRICKLINK_CONSUMER_KEY');
      if (!consumerSecret) missing.push('BRICKLINK_CONSUMER_SECRET');
      if (!token) missing.push('BRICKLINK_TOKEN');
      if (!tokenSecret) missing.push('BRICKLINK_TOKEN_SECRET');
      
      console.error('[BrickLink API] Missing credentials:', missing);
      throw new Error(
        `BrickLink API credentials are missing. Please set the following environment variables:\n${missing.join('\n')}`
      );
    }

    const config: BricklinkConfig = {
      consumerKey,
      consumerSecret,
      token,
      tokenSecret,
    };

    // BrickLink allows 5,000 requests/day (https://www.bricklink.com/v3/terms_of_use_api.page)
    // Optimized for ~20-25 min processing: 60 requests/min with 3 concurrent sets
    // Each set = 3 calls, so 60/min = ~20 sets/min = 600 sets in ~30 minutes
    const rateLimit: RateLimitConfig = {
      requestsPerMinute: parseInt(process.env.BRICKLINK_RATE_LIMIT_PER_MINUTE || '60', 10),
      concurrentRequests: parseInt(process.env.BRICKLINK_CONCURRENT_REQUESTS || '3', 10),
    };

    console.log('[BrickLink API] Client configuration:', {
      baseUrl: config.baseUrl || 'https://api.bricklink.com/api/store/v1',
      rateLimit,
    });

    client = new BricklinkClient(config, rateLimit);
  }

  return client;
}

