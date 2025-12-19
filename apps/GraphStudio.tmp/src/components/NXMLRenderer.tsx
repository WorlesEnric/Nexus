/**
 * NXMLRenderer - New Python backend renderer for NXML panels
 *
 * This component works with the Python workspace-kernel backend:
 * - Fetches JSON AST from Python parser (GET /api/panels/{id}/ast)
 * - Recursively renders components from JSON AST
 * - Resolves prop bindings ({$state.count})
 * - Executes handlers via Python backend (POST /api/panels/{id}/execute)
 * - Real-time state sync via WebSocket
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';

// ===== Type Definitions =====

interface PanelAST {
  kind: 'NexusPanel';
  meta: {
    id: string;
    type: string;
    version: string;
  };
  data: {
    states: StateDefinition[];
  };
  logic: {
    handlers: HandlerDefinition[];
  };
  view: {
    root: ViewNode;
  };
}

interface StateDefinition {
  name: string;
  type: string;
  default: any;
}

interface HandlerDefinition {
  name: string;
  params: string[];
  body: string;
}

interface ViewNode {
  type: string;
  props?: Record<string, any>;
  children?: ViewNode[];
}

interface StateMutation {
  key: string;
  value: any;
}

interface NXMLRendererProps {
  /** Panel ID to render */
  panelId: string;

  /** Workspace ID for WebSocket connection */
  workspaceId: string;

  /** API base URL */
  apiBaseUrl?: string;

  /** WebSocket URL */
  wsUrl?: string;

  /** Authentication token */
  token?: string;

  /** Callback when state changes */
  onStateChange?: (state: Record<string, any>) => void;

  /** Callback when error occurs */
  onError?: (error: Error) => void;

  /** CSS class name */
  className?: string;

  /** Inline styles */
  style?: React.CSSProperties;
}

// ===== Component Registry =====

/**
 * Map of NXML component types to React components
 */
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  Layout: LayoutComponent,
  Text: TextComponent,
  Button: ButtonComponent,
  Input: InputComponent,
  Container: ContainerComponent,
  Row: RowComponent,
  Column: ColumnComponent,
  Card: CardComponent,
  List: ListComponent,
  ListItem: ListItemComponent,
};

// ===== Component Implementations =====

function LayoutComponent({ children, direction = 'column', gap = '1rem', padding = '1rem', ...props }: any) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap,
        padding,
        width: '100%',
        height: '100%',
        ...props.style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function ContainerComponent({ children, padding = '1rem', ...props }: any) {
  return (
    <div style={{ padding, ...props.style }} {...props}>
      {children}
    </div>
  );
}

function RowComponent({ children, gap = '0.5rem', ...props }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap, ...props.style }} {...props}>
      {children}
    </div>
  );
}

function ColumnComponent({ children, gap = '0.5rem', ...props }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...props.style }} {...props}>
      {children}
    </div>
  );
}

function TextComponent({ children, size = '1rem', color, weight, ...props }: any) {
  return (
    <span style={{ fontSize: size, color, fontWeight: weight, ...props.style }} {...props}>
      {children}
    </span>
  );
}

function ButtonComponent({ label, onClick, disabled, variant = 'primary', ...props }: any) {
  const baseStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'all 0.2s',
    opacity: disabled ? 0.5 : 1,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#8b5cf6',
      color: '#ffffff',
    },
    secondary: {
      backgroundColor: '#6b7280',
      color: '#ffffff',
    },
    outline: {
      backgroundColor: 'transparent',
      border: '1px solid #8b5cf6',
      color: '#8b5cf6',
    },
  };

  return (
    <button
      style={{ ...baseStyle, ...variantStyles[variant], ...props.style }}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {label || children}
    </button>
  );
}

function InputComponent({ value, onChange, placeholder, type = 'text', ...props }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '0.5rem',
        borderRadius: '0.375rem',
        border: '1px solid #374151',
        backgroundColor: '#1f2937',
        color: '#ffffff',
        fontSize: '0.875rem',
        ...props.style,
      }}
      {...props}
    />
  );
}

function CardComponent({ children, padding = '1.5rem', ...props }: any) {
  return (
    <div
      style={{
        padding,
        borderRadius: '0.5rem',
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        ...props.style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function ListComponent({ children, ...props }: any) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, ...props.style }} {...props}>
      {children}
    </ul>
  );
}

function ListItemComponent({ children, ...props }: any) {
  return (
    <li style={{ padding: '0.5rem', ...props.style }} {...props}>
      {children}
    </li>
  );
}

// ===== Main Renderer Component =====

export function NXMLRenderer({
  panelId,
  workspaceId,
  apiBaseUrl = 'http://localhost:8000',
  wsUrl = 'ws://localhost:8000',
  token,
  onStateChange,
  onError,
  className,
  style,
}: NXMLRendererProps) {
  const [ast, setAst] = useState<PanelAST | null>(null);
  const [state, setState] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  /**
   * Fetch panel AST from Python backend
   */
  useEffect(() => {
    const fetchAST = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${apiBaseUrl}/api/panels/${panelId}/ast`, {
          headers,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch panel AST: ${response.statusText}`);
        }

        const astData = await response.json();
        setAst(astData);

        // Initialize state from AST
        const initialState: Record<string, any> = {};
        for (const stateDef of astData.data.states) {
          initialState[stateDef.name] = stateDef.default;
        }
        setState(initialState);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAST();
  }, [panelId, apiBaseUrl, token, onError]);

  /**
   * Connect to WebSocket for real-time updates
   */
  useEffect(() => {
    if (!token) return;

    const connectWebSocket = () => {
      const wsConnection = new WebSocket(`${wsUrl}/ws/${workspaceId}?token=${token}`);

      wsConnection.onopen = () => {
        console.log('[NXMLRenderer] WebSocket connected');
        setIsConnected(true);
      };

      wsConnection.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'state_update' && message.panel_id === panelId) {
          // Apply state mutations
          setState((prevState) => {
            const newState = { ...prevState };
            for (const mutation of message.mutations) {
              newState[mutation.key] = mutation.value;
            }
            return newState;
          });
        } else if (message.type === 'connected') {
          console.log('[NXMLRenderer] Connected to workspace:', message.workspace_id);
        } else if (message.type === 'error') {
          console.error('[NXMLRenderer] WebSocket error:', message.message);
        }
      };

      wsConnection.onerror = (event) => {
        console.error('[NXMLRenderer] WebSocket error:', event);
        setIsConnected(false);
      };

      wsConnection.onclose = () => {
        console.log('[NXMLRenderer] WebSocket disconnected');
        setIsConnected(false);

        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      setWs(wsConnection);
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [workspaceId, wsUrl, token, panelId]);

  /**
   * Notify parent of state changes
   */
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  /**
   * Execute handler on Python backend
   */
  const executeHandler = useCallback(
    async (handlerName: string, args: Record<string, any> = {}) => {
      if (!token) {
        console.error('[NXMLRenderer] No token provided for handler execution');
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/panels/${panelId}/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            handler_name: handlerName,
            args,
            current_state: state,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to execute handler: ${response.statusText}`);
        }

        const result = await response.json();

        // Apply state changes
        if (result.mutations) {
          setState((prevState) => {
            const newState = { ...prevState };
            for (const mutation of result.mutations) {
              newState[mutation.key] = mutation.value;
            }
            return newState;
          });
        }

        return result;
      } catch (err) {
        console.error('[NXMLRenderer] Handler execution error:', err);
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    },
    [panelId, apiBaseUrl, token, state, onError]
  );

  /**
   * Resolve prop value (handle bindings like {$state.count})
   */
  const resolvePropValue = useCallback(
    (value: any): any => {
      if (typeof value === 'string') {
        // Check for state binding: {$state.variableName}
        const match = value.match(/^\{\$state\.(\w+)\}$/);
        if (match) {
          const varName = match[1];
          return state[varName];
        }
      }

      return value;
    },
    [state]
  );

  /**
   * Recursively render view node
   */
  const renderNode = useCallback(
    (node: ViewNode, index: number = 0): React.ReactNode => {
      const Component = COMPONENT_MAP[node.type];

      if (!Component) {
        console.warn(`[NXMLRenderer] Unknown component type: ${node.type}`);
        return null;
      }

      // Resolve props
      const resolvedProps: Record<string, any> = {};

      if (node.props) {
        for (const [key, value] of Object.entries(node.props)) {
          // Handle event handlers
          if (key.startsWith('on') && typeof value === 'string') {
            resolvedProps[key] = () => executeHandler(value);
          } else {
            // Resolve bindings
            resolvedProps[key] = resolvePropValue(value);
          }
        }
      }

      // Render children
      const children = node.children?.map((child, idx) => renderNode(child, idx));

      return (
        <Component key={index} {...resolvedProps}>
          {children}
        </Component>
      );
    },
    [resolvePropValue, executeHandler]
  );

  /**
   * Render loading state
   */
  if (isLoading) {
    return (
      <div className={className} style={{ padding: '2rem', textAlign: 'center', ...style }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">Loading panel...</p>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div
        className={className}
        style={{
          padding: '2rem',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: '0.5rem',
          ...style,
        }}
      >
        <h3 className="text-red-400 font-semibold mb-2">Panel Error</h3>
        <p className="text-sm text-red-300">{error.message}</p>
      </div>
    );
  }

  /**
   * Render panel
   */
  if (ast) {
    return (
      <div className={className} style={{ height: '100%', display: 'flex', flexDirection: 'column', ...style }}>
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
              title={isConnected ? 'Connected' : 'Connecting...'}
            />
            <span className="text-sm text-zinc-400">Panel: {panelId.slice(0, 8)}...</span>
          </div>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-auto">{renderNode(ast.view.root)}</div>
      </div>
    );
  }

  /**
   * Fallback
   */
  return (
    <div className={className} style={{ padding: '2rem', textAlign: 'center', ...style }}>
      <p className="text-sm text-zinc-400">Panel not ready</p>
    </div>
  );
}

/**
 * Hook for creating and managing NXML panels with Python backend
 */
export function useNXMLPanel(
  nxmlSource: string,
  workspaceId: string,
  options: {
    apiBaseUrl?: string;
    token?: string;
    initialState?: Record<string, any>;
  } = {}
) {
  const { apiBaseUrl = 'http://localhost:8000', token, initialState } = options;

  const [panelId, setPanelId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPanel = useCallback(async () => {
    if (!token) {
      throw new Error('Authentication token required');
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/panels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: 'New Panel',
          nxml_source: nxmlSource,
          panel_type: 'custom',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create panel: ${response.statusText}`);
      }

      const result = await response.json();
      setPanelId(result.id);
      return result.id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [nxmlSource, workspaceId, apiBaseUrl, token, initialState]);

  const deletePanel = useCallback(async () => {
    if (!panelId || !token) return;

    try {
      await fetch(`${apiBaseUrl}/api/panels/${panelId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setPanelId(null);
    } catch (err) {
      console.error('[useNXMLPanel] Failed to delete panel:', err);
    }
  }, [panelId, apiBaseUrl, token]);

  return {
    panelId,
    createPanel,
    deletePanel,
    isCreating,
    error,
  };
}
