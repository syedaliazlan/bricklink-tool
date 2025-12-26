/**
 * BrickLink API Types
 */

export type ItemType = 'SET' | 'PART' | 'MINIFIG' | 'BOOK' | 'GEAR' | 'CATALOG' | 'INSTRUCTION' | 'ORIGINAL_BOX';

export type Condition = 'N' | 'U'; // New or Used

export type GuideType = 'sold' | 'stock'; // Sold items or current stock

export interface BricklinkConfig {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  baseUrl?: string;
}

export interface PriceGuideParams {
  itemType: ItemType;
  itemNo: string;
  condition?: Condition;
  guideType?: GuideType;
  currency?: string;
  region?: string;
  vat?: 'Y' | 'N';
}

export interface PriceGuideData {
  item: {
    no: string;
    type: ItemType;
  };
  new_or_used: Condition;
  currency_code: string;
  min_price: string;
  max_price: string;
  avg_price: string;
  qty_avg_price: string;
  unit_quantity: number;
  total_quantity: number;
  price_detail: Array<{
    quantity: number;
    unit_price: string;
    shipping_available: boolean;
  }>;
}

export interface BricklinkApiResponse<T> {
  meta: {
    description: string;
    message: string;
    code: number;
  };
  data: T;
}

export interface BricklinkError {
  code: number;
  message: string;
  details?: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  concurrentRequests: number;
}

