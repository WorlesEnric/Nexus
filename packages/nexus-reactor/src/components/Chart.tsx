/**
 * @nexus/reactor - Chart Component (Simple implementation)
 */

import React from 'react';
import type { ChartType } from '../core/types';

interface ChartProps {
  type?: ChartType;
  data?: Array<Record<string, unknown>>;
  xKey?: string;
  yKey?: string;
  height?: number | string;
  style?: React.CSSProperties;
}

export function ChartComponent({
  type = 'line',
  data = [],
  xKey = 'x',
  yKey = 'y',
  height = 300,
  style,
}: ChartProps) {
  const containerStyle: React.CSSProperties = {
    ...baseStyle,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  if (data.length === 0) {
    return (
      <div className="nexus-chart" style={containerStyle}>
        <div style={emptyStyle}>No data available</div>
      </div>
    );
  }

  // Simple SVG bar/line chart
  const values = data.map(d => Number(d[yKey]) || 0);
  const maxValue = Math.max(...values, 1);
  const chartHeight = typeof height === 'number' ? height - 40 : 260;
  const barWidth = Math.max(20, Math.min(60, (300 / data.length)));

  return (
    <div className="nexus-chart" style={containerStyle}>
      <svg width="100%" height="100%" viewBox={`0 0 ${data.length * barWidth + 40} ${chartHeight + 40}`}>
        {/* Y-axis */}
        <line x1="30" y1="10" x2="30" y2={chartHeight + 10} stroke="#e5e7eb" strokeWidth="1" />
        
        {/* X-axis */}
        <line x1="30" y1={chartHeight + 10} x2={data.length * barWidth + 35} y2={chartHeight + 10} stroke="#e5e7eb" strokeWidth="1" />

        {type === 'bar' && values.map((value, i) => (
          <rect
            key={i}
            x={35 + i * barWidth}
            y={10 + chartHeight - (value / maxValue) * chartHeight}
            width={barWidth - 5}
            height={(value / maxValue) * chartHeight}
            fill="#3b82f6"
            rx="2"
          />
        ))}

        {type === 'line' && (
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={values.map((value, i) => 
              `${35 + i * barWidth + barWidth / 2},${10 + chartHeight - (value / maxValue) * chartHeight}`
            ).join(' ')}
          />
        )}

        {type === 'area' && (
          <polygon
            fill="rgba(59, 130, 246, 0.2)"
            stroke="#3b82f6"
            strokeWidth="2"
            points={[
              `35,${chartHeight + 10}`,
              ...values.map((value, i) => 
                `${35 + i * barWidth + barWidth / 2},${10 + chartHeight - (value / maxValue) * chartHeight}`
              ),
              `${35 + (values.length - 1) * barWidth + barWidth / 2},${chartHeight + 10}`,
            ].join(' ')}
          />
        )}

        {/* Data points for line/area */}
        {(type === 'line' || type === 'area') && values.map((value, i) => (
          <circle
            key={i}
            cx={35 + i * barWidth + barWidth / 2}
            cy={10 + chartHeight - (value / maxValue) * chartHeight}
            r="4"
            fill="#3b82f6"
          />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={35 + i * barWidth + barWidth / 2}
            y={chartHeight + 25}
            textAnchor="middle"
            fontSize="10"
            fill="#666"
          >
            {String(d[xKey] || i).slice(0, 5)}
          </text>
        ))}
      </svg>
    </div>
  );
}

const baseStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  overflow: 'hidden',
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#9ca3af',
};