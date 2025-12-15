/**
 * @nexus/reactor - Container Component
 */

import React from 'react';
import type { ContainerVariant } from '../core/types';

interface ContainerProps {
  title?: string;
  variant?: ContainerVariant;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function ContainerComponent({
  title,
  variant = 'card',
  style,
  children,
}: ContainerProps) {
  const containerStyle: React.CSSProperties = {
    ...getVariantStyle(variant),
    ...style,
  };

  return (
    <div className={`nexus-container nexus-container-${variant}`} style={containerStyle}>
      {title && (
        <div className="nexus-container-header" style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
        </div>
      )}
      <div className="nexus-container-content" style={contentStyle}>
        {children}
      </div>
    </div>
  );
}

function getVariantStyle(variant: ContainerVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: '8px',
    overflow: 'hidden',
  };

  switch (variant) {
    case 'card':
      return {
        ...base,
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      };
    case 'panel':
      return {
        ...base,
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
      };
    case 'section':
      return {
        ...base,
        backgroundColor: 'transparent',
        borderBottom: '1px solid #e0e0e0',
        borderRadius: 0,
      };
    case 'transparent':
      return {
        ...base,
        backgroundColor: 'transparent',
      };
    default:
      return base;
  }
}

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #e0e0e0',
  backgroundColor: '#fafafa',
};

const contentStyle: React.CSSProperties = {
  padding: '16px',
};