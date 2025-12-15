/**
 * @nexus/reactor - Grid Utilities
 *
 * CSS Grid utilities for the 12-column layout system
 */

import type { ColumnSpan, GapSize } from '../core/types';
import { GRID_COLUMNS, GAP_SIZES } from '../core/constants';

/**
 * Generate grid column CSS for a column span
 */
export function getGridColumnStyle(colSpan: ColumnSpan): React.CSSProperties {
  return {
    gridColumn: `span ${colSpan}`,
  };
}

/**
 * Generate grid container CSS
 */
export function getGridContainerStyle(gap: GapSize = 'md'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
    gap: GAP_SIZES[gap] || GAP_SIZES.md,
  };
}

/**
 * Calculate responsive breakpoint for grid
 */
export function getResponsiveColumns(width: number): number {
  if (width < 640) return 4;   // Mobile: 4 columns
  if (width < 1024) return 8;  // Tablet: 8 columns
  return 12;                    // Desktop: 12 columns
}

/**
 * Generate column span for responsive layout
 */
export function getResponsiveColumnSpan(
  desiredSpan: ColumnSpan,
  availableColumns: number
): ColumnSpan {
  const maxSpan = Math.min(desiredSpan, availableColumns) as ColumnSpan;
  return maxSpan;
}

/**
 * Check if a row is full
 */
export function isRowFull(currentRowWeight: number, additionalWeight: number): boolean {
  return currentRowWeight + additionalWeight > GRID_COLUMNS;
}

/**
 * Calculate how many items fit in a row
 */
export function getItemsPerRow(itemWeight: ColumnSpan): number {
  return Math.floor(GRID_COLUMNS / itemWeight);
}

/**
 * Get gap size in pixels
 */
export function getGapSizePixels(gap: GapSize): number {
  const gapString = GAP_SIZES[gap] || GAP_SIZES.md;
  return parseFloat(gapString) * 16; // Convert rem to pixels (assuming 16px base)
}

/**
 * Generate CSS class name for grid column span
 */
export function getGridColumnClass(colSpan: ColumnSpan): string {
  return `col-span-${colSpan}`;
}

/**
 * Generate full grid CSS class string
 */
export function getGridClasses(colSpan: ColumnSpan, newRow: boolean = false): string {
  const classes = [getGridColumnClass(colSpan)];
  if (newRow) classes.push('new-row');
  return classes.join(' ');
}
