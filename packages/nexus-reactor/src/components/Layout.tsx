/**
 * @nexus/reactor - Layout Component
 */

import React from 'react';
import type { LayoutStrategy, GapSize, Alignment } from '../core/types';
import { GAP_SIZES } from '../core/constants';

interface LayoutProps {
  strategy?: LayoutStrategy;
  gap?: GapSize;
  align?: Alignment;
  justify?: Alignment;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function LayoutComponent({
  strategy = 'auto',
  gap = 'md',
  align,
  justify,
  style,
  children,
}: LayoutProps) {
  const layoutStyle: React.CSSProperties = {
    ...style,
  };

  if (strategy === 'auto' || strategy === 'row') {
    layoutStyle.display = 'grid';
    layoutStyle.gridTemplateColumns = 'repeat(12, 1fr)';
    layoutStyle.gap = GAP_SIZES[gap] || GAP_SIZES.md;
  } else if (strategy === 'stack') {
    layoutStyle.display = 'flex';
    layoutStyle.flexDirection = 'column';
    layoutStyle.gap = GAP_SIZES[gap] || GAP_SIZES.md;
  }

  if (align) {
    layoutStyle.alignItems = mapAlignment(align);
  }
  if (justify) {
    layoutStyle.justifyContent = mapAlignment(justify);
  }

  return (
    <div className="nexus-layout" style={layoutStyle}>
      {children}
    </div>
  );
}

function mapAlignment(align: Alignment): string {
  switch (align) {
    case 'start': return 'flex-start';
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'stretch': return 'stretch';
    default: return 'stretch';
  }
}