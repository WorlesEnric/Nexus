/**
 * @nexus/reactor - Layout Engine
 * 
 * Calculates 12-column grid layout for ViewAST nodes.
 */

import type { ViewNode, ViewAST, LayoutInfo, ColumnSpan, LayoutStrategy, GapSize } from '../core/types';
import { GRID_COLUMNS, GAP_SIZES, getComponentWeight } from '../core/constants';

/**
 * Process the ViewAST and inject layout information
 */
export function processLayout(view: ViewAST): ViewAST {
  const processedRoot = processNode(view.root, null);
  return {
    ...view,
    root: processedRoot,
  };
}

/**
 * Process a single ViewNode and its children
 */
function processNode(node: ViewNode, parentStrategy: LayoutStrategy | null): ViewNode {
  const strategy = getStrategy(node);
  
  // Process children first
  const processedChildren = processChildren(node.children, strategy);
  
  // Calculate layout for this node
  const layout = calculateLayout(node, parentStrategy);
  
  return {
    ...node,
    children: processedChildren,
    layout,
  };
}

/**
 * Process all children with the parent's strategy
 */
function processChildren(children: ViewNode[], parentStrategy: LayoutStrategy | null): ViewNode[] {
  if (children.length === 0) return [];
  
  if (parentStrategy === 'auto') {
    return applyTetrisLayout(children).map(child => 
      processNode(child, parentStrategy)
    );
  }
  
  return children.map(child => processNode(child, parentStrategy));
}

/**
 * Apply the "Tetris" algorithm for auto layout
 */
function applyTetrisLayout(children: ViewNode[]): ViewNode[] {
  let currentRowWeight = 0;
  
  return children.map((child, index) => {
    const weight = getComponentWeight(child.type);
    let newRow = false;
    
    // Check if we need to start a new row
    if (currentRowWeight + weight > GRID_COLUMNS) {
      newRow = index > 0; // Don't mark first item as new row
      currentRowWeight = weight;
    } else {
      currentRowWeight += weight;
    }
    
    const layout: LayoutInfo = {
      colSpan: weight as ColumnSpan,
      className: generateClassName(weight as ColumnSpan, newRow),
      newRow,
    };
    
    return {
      ...child,
      layout,
    };
  });
}

/**
 * Calculate layout info for a node based on parent context
 */
function calculateLayout(node: ViewNode, _parentStrategy: LayoutStrategy | null): LayoutInfo {
  const weight = getComponentWeight(node.type);
  
  // If already has layout from Tetris, keep it
  if (node.layout) {
    return node.layout;
  }
  
  return {
    colSpan: weight as ColumnSpan,
    className: generateClassName(weight as ColumnSpan, false),
    newRow: false,
  };
}

/**
 * Get the layout strategy for a node
 */
function getStrategy(node: ViewNode): LayoutStrategy | null {
  if (node.type === 'Layout') {
    return (node.props.strategy as LayoutStrategy) ?? 'auto';
  }
  return null;
}

/**
 * Generate CSS class names for layout
 */
function generateClassName(colSpan: ColumnSpan, newRow: boolean): string {
  const classes: string[] = [];
  
  // Column span class
  classes.push(`col-span-${colSpan}`);
  
  // New row indicator
  if (newRow) {
    classes.push('new-row');
  }
  
  return classes.join(' ');
}

/**
 * Get CSS styles for a layout node
 */
export function getLayoutStyles(node: ViewNode): React.CSSProperties {
  const styles: React.CSSProperties = {};
  
  if (node.type === 'Layout') {
    const strategy = (node.props.strategy as LayoutStrategy) ?? 'auto';
    const gap = (node.props.gap as GapSize) ?? 'md';
    const align = node.props.align as string;
    const justify = node.props.justify as string;
    
    if (strategy === 'auto' || strategy === 'row') {
      styles.display = 'grid';
      styles.gridTemplateColumns = 'repeat(12, 1fr)';
      styles.gap = GAP_SIZES[gap] || GAP_SIZES.md;
    } else if (strategy === 'stack') {
      styles.display = 'flex';
      styles.flexDirection = 'column';
      styles.gap = GAP_SIZES[gap] || GAP_SIZES.md;
    }
    
    if (align) {
      styles.alignItems = mapAlignment(align);
    }
    if (justify) {
      styles.justifyContent = mapAlignment(justify);
    }
  }
  
  return styles;
}

/**
 * Get CSS styles for a child's layout info
 */
export function getChildLayoutStyles(layout?: LayoutInfo): React.CSSProperties {
  if (!layout) return {};
  
  return {
    gridColumn: `span ${layout.colSpan}`,
  };
}

/**
 * Map alignment strings to CSS values
 */
function mapAlignment(align: string): string {
  switch (align) {
    case 'start': return 'flex-start';
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'stretch': return 'stretch';
    default: return align;
  }
}

/**
 * Analyze the view tree and return layout statistics
 */
export function analyzeLayout(view: ViewAST): LayoutStats {
  const stats: LayoutStats = {
    totalNodes: 0,
    layoutNodes: 0,
    controlFlowNodes: 0,
    componentNodes: 0,
    maxDepth: 0,
    componentCounts: {},
  };
  
  analyzeNode(view.root, stats, 0);
  
  return stats;
}

function analyzeNode(node: ViewNode, stats: LayoutStats, depth: number): void {
  stats.totalNodes++;
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  
  if (node.type === 'Layout' || node.type === 'Container') {
    stats.layoutNodes++;
  } else if (node.type === 'If' || node.type === 'Iterate') {
    stats.controlFlowNodes++;
  } else {
    stats.componentNodes++;
  }
  
  stats.componentCounts[node.type] = (stats.componentCounts[node.type] || 0) + 1;
  
  for (const child of node.children) {
    analyzeNode(child, stats, depth + 1);
  }
}

export interface LayoutStats {
  totalNodes: number;
  layoutNodes: number;
  controlFlowNodes: number;
  componentNodes: number;
  maxDepth: number;
  componentCounts: Record<string, number>;
}