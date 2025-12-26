/**
 * Application-level type definitions
 */

export interface SetInput {
  setNumber: string;
  condition: 'new' | 'used';
}

export interface SetPriceResult {
  setNumber: string;
  setName?: string;
  condition: 'new' | 'used';
  
  // Sold metrics
  timesSold: number | null;
  avgSoldPrice: string | null;
  minSoldPrice: string | null;
  maxSoldPrice: string | null;
  
  // For sale metrics
  itemsForSale: number | null;
  avgSalePrice: string | null;
  minSalePrice: string | null;
  maxSalePrice: string | null;
  
  // User-editable fields
  myBuyPrice?: string;
  mySellPrice?: string;
  notes?: string;
  
  // Status
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
  
  // Metadata
  currency: string;
  lastUpdated?: string;
}

export interface LookupRequest {
  sets: SetInput[];
  forceRefresh?: boolean;
}

export interface LookupResponse {
  status: 'completed';
  totalSets: number;
  results: SetPriceResult[];
}

export interface AppConfig {
  maxSetsPerJob: number;
  defaultCurrency: string;
  cacheTtlHours: number;
}

