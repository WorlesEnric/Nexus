/**
 * @nexus/reactor - If Component (Conditional Rendering)
 */

import React, { useMemo } from 'react';
import type { RuntimeValue } from '../core/types';
import { extractExpression, evaluateExpression, isBindingExpression } from '../utils/expression';

interface IfProps {
  condition?: string | boolean;
  evalContext?: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  };
  children?: () => React.ReactNode;
}

export function IfComponent({
  condition,
  evalContext = {},
  children,
}: IfProps) {
  const shouldRender = useMemo(() => {
    if (typeof condition === 'boolean') return condition;
    if (typeof condition !== 'string') return false;

    // Evaluate the condition expression
    if (isBindingExpression(condition)) {
      const expr = extractExpression(condition);
      return Boolean(evaluateExpression(expr, evalContext));
    }

    // Try to evaluate as expression directly
    return Boolean(evaluateExpression(condition, evalContext));
  }, [condition, evalContext]);

  if (!shouldRender) return null;

  // Call children as function to get elements
  return <>{typeof children === 'function' ? children() : children}</>;
}