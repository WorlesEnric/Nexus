/**
 * @nexus/reactor - LogStream Component
 */

import React, { useRef, useEffect } from 'react';

interface LogEntry {
  id?: string;
  timestamp?: number;
  level?: string;
  message?: string;
  [key: string]: unknown;
}

interface LogStreamProps {
  data?: LogEntry[];
  height?: number | string;
  autoScroll?: boolean;
  style?: React.CSSProperties;
}

export function LogStreamComponent({
  data = [],
  height = 200,
  autoScroll = true,
  style,
}: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  const containerStyle: React.CSSProperties = {
    ...baseStyle,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <div ref={containerRef} className="nexus-log-stream" style={containerStyle}>
      {data.map((entry, index) => (
        <div
          key={entry.id ?? index}
          className="nexus-log-entry"
          style={getEntryStyle(entry.level)}
        >
          {entry.timestamp && (
            <span style={timestampStyle}>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          )}
          {entry.level && (
            <span style={getLevelStyle(entry.level)}>
              [{entry.level.toUpperCase()}]
            </span>
          )}
          <span style={messageStyle}>{entry.message ?? JSON.stringify(entry)}</span>
        </div>
      ))}
      {data.length === 0 && (
        <div style={emptyStyle}>No log entries</div>
      )}
    </div>
  );
}

const baseStyle: React.CSSProperties = {
  backgroundColor: '#1e1e1e',
  color: '#d4d4d4',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  padding: '8px',
  borderRadius: '6px',
  overflowY: 'auto',
  overflowX: 'hidden',
};

function getEntryStyle(level?: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '2px 0',
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #333',
  };

  if (level === 'error') {
    return { ...base, backgroundColor: 'rgba(239, 68, 68, 0.1)' };
  }
  if (level === 'warn') {
    return { ...base, backgroundColor: 'rgba(245, 158, 11, 0.1)' };
  }
  return base;
}

const timestampStyle: React.CSSProperties = {
  color: '#666',
  flexShrink: 0,
};

function getLevelStyle(level: string): React.CSSProperties {
  const colors: Record<string, string> = {
    debug: '#9ca3af',
    info: '#3b82f6',
    warn: '#f59e0b',
    error: '#ef4444',
  };
  return {
    color: colors[level] || '#9ca3af',
    flexShrink: 0,
    fontWeight: 600,
  };
}

const messageStyle: React.CSSProperties = {
  wordBreak: 'break-all',
};

const emptyStyle: React.CSSProperties = {
  color: '#666',
  textAlign: 'center',
  padding: '20px',
};