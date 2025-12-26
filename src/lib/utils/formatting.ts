/**
 * Formatting utilities
 */

/**
 * Format currency value
 */
export function formatCurrency(value: string | number | null | undefined, currency: string = 'GBP'): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '-';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/**
 * Format number with commas
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }
  
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Format date/time
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) {
    return '-';
  }
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  
  return formatDateTime(d);
}

/**
 * Get condition display name
 */
export function getConditionDisplay(condition: 'new' | 'used' | 'N' | 'U'): string {
  return condition === 'new' || condition === 'N' ? 'New' : 'Used';
}

/**
 * Convert condition to BrickLink format
 */
export function toBricklinkCondition(condition: 'new' | 'used'): 'N' | 'U' {
  return condition === 'new' ? 'N' : 'U';
}

/**
 * Convert BrickLink condition to app format
 */
export function fromBricklinkCondition(condition: 'N' | 'U'): 'new' | 'used' {
  return condition === 'N' ? 'new' : 'used';
}

/**
 * Decode HTML entities in a string
 * Handles both named entities (like &apos;) and numeric entities (like &#39;)
 */
export function decodeHtmlEntities(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  
  // Use browser's built-in decoder if available (client-side)
  if (typeof window !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  
  // Server-side fallback: decode entities manually
  // Order matters: decode numeric/hex entities first, then named entities
  // Must decode &amp; last to avoid double-decoding
  return text
    // Handle hex entities first (&#x1F;)
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Handle numeric entities (&#123;)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Handle named entities (must come after numeric to avoid conflicts)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Decode &amp; last to avoid double-decoding
    .replace(/&amp;/g, '&');
}

