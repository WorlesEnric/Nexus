/**
 * @nexus/reactor - Metric Component
 */

import React from 'react';

interface MetricProps {
  label?: string;
  value?: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  style?: React.CSSProperties;
}

export function MetricComponent({
  label = '',
  value = '',
  unit = '',
  trend,
  style,
}: MetricProps) {
  return (
    <div className="nexus-metric" style={{ ...containerStyle, ...style }}>
      <div className="nexus-metric-label" style={labelStyle}>
        {label}
      </div>
      <div className="nexus-metric-value" style={valueStyle}>
        <span>{value}</span>
        {unit && <span style={unitStyle}>{unit}</span>}
        {trend && <span style={getTrendStyle(trend)}>{getTrendIcon(trend)}</span>}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '16px',
  backgroundColor: '#fff',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'baseline',
  gap: '4px',
};

const unitStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#666',
  fontWeight: 400,
};

function getTrendStyle(trend: 'up' | 'down' | 'neutral'): React.CSSProperties {
  const colors = {
    up: '#22c55e',
    down: '#ef4444',
    neutral: '#666',
  };
  return {
    marginLeft: '8px',
    fontSize: '1rem',
    color: colors[trend],
  };
}

function getTrendIcon(trend: 'up' | 'down' | 'neutral'): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    default: return '→';
  }
}