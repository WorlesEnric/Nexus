/**
 * @nexus/reactor - Text Component
 */

import React from 'react';
import type { TextVariant } from '../core/types';

interface TextProps {
  content?: string;
  variant?: TextVariant;
  style?: React.CSSProperties;
}

export function TextComponent({
  content = '',
  variant = 'body',
  style,
}: TextProps) {
  const Tag = getTag(variant);
  const textStyle: React.CSSProperties = {
    ...getVariantStyle(variant),
    ...style,
  };

  return (
    <Tag className={`nexus-text nexus-text-${variant}`} style={textStyle}>
      {content}
    </Tag>
  );
}

function getTag(variant: TextVariant): keyof JSX.IntrinsicElements {
  switch (variant) {
    case 'h1': return 'h1';
    case 'h2': return 'h2';
    case 'h3': return 'h3';
    case 'h4': return 'h4';
    case 'code': return 'code';
    case 'caption': return 'span';
    default: return 'p';
  }
}

function getVariantStyle(variant: TextVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    margin: 0,
    fontFamily: 'inherit',
  };

  switch (variant) {
    case 'h1':
      return { ...base, fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 };
    case 'h2':
      return { ...base, fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 };
    case 'h3':
      return { ...base, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 };
    case 'h4':
      return { ...base, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 };
    case 'code':
      return {
        ...base,
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        backgroundColor: '#f5f5f5',
        padding: '2px 6px',
        borderRadius: '4px',
      };
    case 'caption':
      return { ...base, fontSize: '0.75rem', color: '#666' };
    default:
      return { ...base, fontSize: '1rem', lineHeight: 1.6 };
  }
}