import type { KeyboardEvent } from 'react';

/**
 * Blocks negative signs, plus signs, and exponential notation keys on numeric inputs.
 */
export function blockNegativeNumericKeys(
  e: KeyboardEvent<HTMLInputElement>
): void {
  if (['-', '+', 'e', 'E'].includes(e.key)) {
    e.preventDefault();
  }
}

/**
 * Sanitizes positive decimal input: retains only digits and at most one decimal point.
 */
export function sanitizePositiveDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const intPart = cleaned.slice(0, firstDot);
  const decPart = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return `${intPart}.${decPart}`;
}

/**
 * Sanitizes positive integer / phone digit input: strips all non-digits.
 */
export function sanitizePositiveInteger(raw: string): string {
  return raw.replace(/\D/g, '');
}
