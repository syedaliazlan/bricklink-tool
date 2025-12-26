import crypto from 'crypto';

/**
 * OAuth 1.0 utilities for BrickLink API authentication
 */

interface OAuthParams {
  oauth_consumer_key: string;
  oauth_token: string;
  oauth_signature_method: string;
  oauth_timestamp: string;
  oauth_nonce: string;
  oauth_version: string;
  oauth_signature?: string;
}

export class OAuth1 {
  private consumerSecret: string;
  private tokenSecret: string;

  constructor(consumerSecret: string, tokenSecret: string) {
    this.consumerSecret = consumerSecret;
    this.tokenSecret = tokenSecret;
  }

  /**
   * Generate OAuth 1.0 signature
   */
  private generateSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): string {
    // Sort parameters alphabetically
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
      .join('&');

    // Create signature base string
    const signatureBase = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(sortedParams),
    ].join('&');

    // Create signing key
    const signingKey = `${this.percentEncode(this.consumerSecret)}&${this.percentEncode(this.tokenSecret)}`;

    // Generate HMAC-SHA1 signature
    const hmac = crypto.createHmac('sha1', signingKey);
    hmac.update(signatureBase);
    return hmac.digest('base64');
  }

  /**
   * Percent-encode a string according to OAuth spec
   */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  /**
   * Generate OAuth parameters for a request
   */
  generateOAuthParams(consumerKey: string, token: string): OAuthParams {
    return {
      oauth_consumer_key: consumerKey,
      oauth_token: token,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(32).toString('base64'),
      oauth_version: '1.0',
    };
  }

  /**
   * Build Authorization header value
   */
  buildAuthorizationHeader(
    method: string,
    url: string,
    consumerKey: string,
    token: string,
    queryParams: Record<string, string> = {}
  ): string {
    const oauthParams = this.generateOAuthParams(consumerKey, token);
    
    // Combine OAuth params with query params for signature
    const allParams = { ...oauthParams, ...queryParams };
    
    // Generate signature
    const signature = this.generateSignature(method, url, allParams);
    
    // Add signature to OAuth params
    const signedOAuthParams = { ...oauthParams, oauth_signature: signature };
    
    // Build header value - include realm="" as per BrickLink API spec
    const headerValue = [
      'realm=""',
      ...Object.keys(signedOAuthParams)
        .sort()
        .map(key => `${this.percentEncode(key)}="${this.percentEncode(signedOAuthParams[key as keyof OAuthParams]!)}"`)
    ].join(', ');
    
    return `OAuth ${headerValue}`;
  }
}

