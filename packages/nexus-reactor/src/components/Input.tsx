/**
 * @nexus/reactor - Input Component
 */

import React, { useCallback } from 'react';
import type { InputType } from '../core/types';

interface InputProps {
  placeholder?: string;
  inputType?: InputType;
  disabled?: boolean;
  boundValue?: string | number;
  onBind?: (value: unknown) => void;
  style?: React.CSSProperties;
}

export function InputComponent({
  placeholder = '',
  inputType = 'text',
  disabled = false,
  boundValue = '',
  onBind,
  style,
}: InputProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (onBind) {
      const value = inputType === 'number' ? Number(e.target.value) : e.target.value;
      onBind(value);
    }
  }, [onBind, inputType]);

  const inputStyle: React.CSSProperties = {
    ...baseStyle,
    ...(disabled ? disabledStyle : {}),
    ...style,
  };

  return (
    <input
      className="nexus-input"
      type={inputType}
      placeholder={placeholder}
      disabled={disabled}
      value={boundValue}
      onChange={handleChange}
      style={inputStyle}
    />
  );
}

const baseStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

const disabledStyle: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  color: '#9ca3af',
  cursor: 'not-allowed',
};