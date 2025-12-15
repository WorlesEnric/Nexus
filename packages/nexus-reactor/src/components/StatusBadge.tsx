/**
 * @nexus/reactor - StatusBadge Component
 */

import React from 'react';
import type { StatusType } from '../core/types';

interface StatusBadgeProps {
  label?: string;
  value?: string;
  status?: StatusType;
  style?: React.CSSProperties;
}

export function StatusBadgeComponent({
  label = '',
  value,
  status = 'info',
  style,
}: StatusBadgeProps) {
  const badgeStyle: React.CSSProperties = {
    ...containerStyle,
    ...getStatusStyle(status),
    ...style,
  };

  return (
    <div className={`nexus-status-badge nexus-status-${status}`} style={badgeStyle}>
      <span className="nexus-status-dot" style={getDotStyle(status)} />
      <span className="nexus-status-label">{label || value}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '16px',
  fontSize: '0.875rem',
  fontWeight: 500,
};

function getStatusStyle(status: StatusType): React.CSSProperties {
  const styles: Record<StatusType, React.CSSProperties> = {
    success: { backgroundColor: '#dcfce7', color: '#166534' },
    warn: { backgroundColor: '#fef3c7', color: '#92400e' },
    error: { backgroundColor: '#fee2e2', color: '#991b1b' },
    info: { backgroundColor: '#e0f2fe', color: '#075985' },
  };
  return styles[status] || styles.info;
}

function getDotStyle(status: StatusType): React.CSSProperties {
  const colors: Record<StatusType, string> = {
    success: '#22c55e',
    warn: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  };
  return {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: colors[status] || colors.info,
  };
}