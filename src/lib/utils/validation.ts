import { z } from 'zod';

/**
 * Validation schemas and utilities
 */

// Set number format: accepts both XXXXX-X (e.g., 10188-1) or just numbers (e.g., 75158)
// Numeric-only IDs will be normalized to XXXXX-1 format
export const setNumberSchema = z.string()
  .refine(
    (val) => /^\d{4,6}(-\d{1,2})?$/.test(val.trim()),
    { message: 'Set number must be numeric (e.g., 75158) or in format XXXXX-X (e.g., 10188-1)' }
  );

export const conditionSchema = z.enum(['new', 'used'], {
  errorMap: () => ({ message: 'Condition must be "new" or "used"' }),
});

export const setInputSchema = z.object({
  setNumber: setNumberSchema,
  condition: conditionSchema,
});

export const lookupJobRequestSchema = z.object({
  sets: z.array(setInputSchema)
    .min(1, 'At least one set is required')
    .max(600, 'Maximum 600 sets allowed per job'),
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Normalize set number format
 * Converts numeric IDs (e.g., 75158) to full format (e.g., 75158-1)
 * Leaves full format (e.g., 10188-1) unchanged
 */
function normalizeSetNumber(input: string): string {
  const trimmed = input.trim();
  
  // If it's already in full format (has dash), return as-is
  if (trimmed.includes('-')) {
    return trimmed;
  }
  
  // If it's just numbers, append -1 (most common variant)
  if (/^\d{4,6}$/.test(trimmed)) {
    return `${trimmed}-1`;
  }
  
  return trimmed;
}

/**
 * Parse and validate set number
 */
export function parseSetNumber(input: string): { setNumber: string; isValid: boolean; error?: string } {
  const trimmed = input.trim();
  
  try {
    setNumberSchema.parse(trimmed);
    // Normalize to full format for API consistency
    const normalized = normalizeSetNumber(trimmed);
    return { setNumber: normalized, isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { setNumber: trimmed, isValid: false, error: error.errors[0].message };
    }
    return { setNumber: trimmed, isValid: false, error: 'Invalid set number format' };
  }
}

/**
 * Parse multi-line set input
 */
export function parseSetList(input: string, defaultCondition: 'new' | 'used' = 'new'): {
  valid: Array<{ setNumber: string; condition: 'new' | 'used' }>;
  invalid: Array<{ line: string; error: string }>;
} {
  const lines = input.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const valid: Array<{ setNumber: string; condition: 'new' | 'used' }> = [];
  const invalid: Array<{ line: string; error: string }> = [];
  
  for (const line of lines) {
    const parsed = parseSetNumber(line);
    
    if (parsed.isValid) {
      valid.push({ setNumber: parsed.setNumber, condition: defaultCondition });
    } else {
      invalid.push({ line, error: parsed.error || 'Invalid format' });
    }
  }
  
  return { valid, invalid };
}

/**
 * Parse condition value (case-insensitive)
 */
function parseCondition(value: string | undefined): 'new' | 'used' | null {
  if (!value) return null;
  
  const normalized = value.trim().toLowerCase();
  
  if (normalized === 'new' || normalized === 'n') {
    return 'new';
  }
  if (normalized === 'used' || normalized === 'u') {
    return 'used';
  }
  
  return null;
}

/**
 * Parse CSV file data with set numbers and conditions
 */
export function parseCSVFile(csvData: any[]): {
  valid: Array<{ setNumber: string; condition: 'new' | 'used' }>;
  invalid: Array<{ line: string; error: string }>;
} {
  const valid: Array<{ setNumber: string; condition: 'new' | 'used' }> = [];
  const invalid: Array<{ line: string; error: string }> = [];
  
  for (const row of csvData) {
    // Skip empty rows
    if (!row || (typeof row === 'object' && Object.keys(row).length === 0)) {
      continue;
    }
    
    // Try to find set number in various column name formats
    let setNumber: string | undefined;
    let condition: string | undefined;
    
    if (typeof row === 'object' && row !== null) {
      // Try common column name variations (including simple "Set" and "Condition")
      setNumber = row.set_number || row.setNumber || row['Set Number'] || row['Set ID'] || 
                  row['set_number'] || row['setNumber'] || row['set_id'] || row['Set_ID'] ||
                  row['Set'] || row['set'] || row['ID'] || row['id'] ||
                  row[Object.keys(row)[0]]; // First column if no match
      
      condition = row.condition || row.Condition || row['condition'] || row['Condition'] ||
                  row.new_or_used || row['New or Used'] || row['new_or_used'] ||
                  row[Object.keys(row)[1]]; // Second column if no match
    } else if (Array.isArray(row)) {
      // Handle array format: [setNumber, condition]
      setNumber = row[0]?.toString().trim();
      condition = row[1]?.toString().trim();
    }
    
    if (!setNumber) {
      invalid.push({
        line: JSON.stringify(row),
        error: 'Set number not found in row',
      });
      continue;
    }
    
    const trimmedSetNumber = setNumber.toString().trim();
    const parsedSetNumber = parseSetNumber(trimmedSetNumber);
    
    if (!parsedSetNumber.isValid) {
      invalid.push({
        line: `${trimmedSetNumber}${condition ? `,${condition}` : ''}`,
        error: parsedSetNumber.error || 'Invalid set number format',
      });
      continue;
    }
    
    const parsedCondition = parseCondition(condition);
    
    if (!parsedCondition) {
      invalid.push({
        line: `${trimmedSetNumber},${condition || '(missing)'}`,
        error: 'Invalid condition. Must be "new", "used", "New", "Used", "N", or "U"',
      });
      continue;
    }
    
    valid.push({
      setNumber: parsedSetNumber.setNumber,
      condition: parsedCondition,
    });
  }
  
  return { valid, invalid };
}

/**
 * Deduplicate set list
 */
export function deduplicateSets(sets: Array<{ setNumber: string; condition: 'new' | 'used' }>): 
  Array<{ setNumber: string; condition: 'new' | 'used' }> {
  const seen = new Set<string>();
  const result: Array<{ setNumber: string; condition: 'new' | 'used' }> = [];
  
  for (const set of sets) {
    const key = `${set.setNumber}-${set.condition}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(set);
    }
  }
  
  return result;
}

