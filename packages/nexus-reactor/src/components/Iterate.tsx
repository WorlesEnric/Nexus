/**
 * @nexus/reactor - Iterate Component (Loop Rendering)
 */

import React, { useMemo } from 'react';
import type { RuntimeValue } from '../core/types';
import { extractExpression, evaluateExpression, isBindingExpression } from '../utils/expression';

interface IterateProps {
  items?: string | unknown[];
  as?: string;
  keyProp?: string;
  evalContext?: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  };
  scope?: Record<string, unknown>;
  children?: (scope: Record<string, unknown>) => React.ReactNode;
}

export function IterateComponent({
  items,
  as = 'item',
  keyProp,
  evalContext = {},
  scope = {},
  children,
}: IterateProps) {
  const itemsArray = useMemo(() => {
    if (Array.isArray(items)) return items;
    if (typeof items !== 'string') return [];

    // Evaluate the items expression
    if (isBindingExpression(items)) {
      const expr = extractExpression(items);
      const result = evaluateExpression(expr, evalContext);
      return Array.isArray(result) ? result : [];
    }

    // Try to evaluate as expression directly
    const result = evaluateExpression(items, evalContext);
    return Array.isArray(result) ? result : [];
  }, [items, evalContext]);

  if (!Array.isArray(itemsArray) || itemsArray.length === 0) {
    return null;
  }

  return (
    <>
      {itemsArray.map((item, index) => {
        // Create scope with loop variable
        const itemScope: Record<string, unknown> = {
          ...scope,
          [as]: item,
          [`${as}Index`]: index,
        };

        // Get key
        const key = keyProp && typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>)[keyProp]
          : index;

        return (
          <React.Fragment key={String(key)}>
            {typeof children === 'function' ? children(itemScope) : children}
          </React.Fragment>
        );
      })}
    </>
  );
}