/**
 * @nexus/reactor - Button Component
 */

import React from 'react';
import type { ButtonVariant } from '../core/types';

interface ButtonProps {
  label?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  trigger?: string;
  onTrigger?: () => void;
  style?: React.CSSProperties;
}

export function ButtonComponent({
  label = 'Button',
  variant = 'primary',
  disabled = false,
  onTrigger,
  style,
}: ButtonProps) {
  const buttonStyle: React.CSSProperties = {
    ...baseStyle,
    ...getVariantStyle(variant, disabled),
    ...style,
  };

  const handleClick = () => {
    if (!disabled && onTrigger) {
      onTrigger();
    }
  };

  return (
    <button
      className={`nexus-button nexus-button-${variant}`}
      style={buttonStyle}
      onClick={handleClick}
      disabled={disabled}
      type="button"
    >
      {label}
    </button>
  );
}

const baseStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function getVariantStyle(variant: ButtonVariant, disabled: boolean): React.CSSProperties {
  if (disabled) {
    return { backgroundColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' };
  }

  const styles: Record<ButtonVariant, React.CSSProperties> = {
    primary: { backgroundColor: '#3b82f6', color: '#fff' },
    secondary: { backgroundColor: '#e5e7eb', color: '#374151' },
    danger: { backgroundColor: '#ef4444', color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6' },
  };

  return styles[variant] || styles.primary;
}