/**
 * @nexus/reactor - Switch Component
 */

import React, { useCallback } from 'react';

interface SwitchProps {
  label?: string;
  disabled?: boolean;
  boundValue?: boolean;
  onBind?: (value: boolean) => void;
  style?: React.CSSProperties;
}

export function SwitchComponent({
  label,
  disabled = false,
  boundValue = false,
  onBind,
  style,
}: SwitchProps) {
  const handleToggle = useCallback(() => {
    if (!disabled && onBind) {
      onBind(!boundValue);
    }
  }, [disabled, boundValue, onBind]);

  return (
    <div className="nexus-switch-container" style={{ ...containerStyle, ...style }}>
      <button
        type="button"
        role="switch"
        aria-checked={boundValue}
        className={`nexus-switch ${boundValue ? 'nexus-switch-on' : ''}`}
        style={getSwitchStyle(boundValue, disabled)}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span style={getThumbStyle(boundValue)} />
      </button>
      {label && <span style={labelStyle}>{label}</span>}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#374151',
};

function getSwitchStyle(checked: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s ease',
    backgroundColor: disabled ? '#e5e7eb' : checked ? '#3b82f6' : '#d1d5db',
    padding: 0,
  };
}

function getThumbStyle(checked: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: '2px',
    left: checked ? '22px' : '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  };
}