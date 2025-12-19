/**
 * NexusContext - React Context for NexusClient
 *
 * Provides access to NexusClient throughout the React component tree
 * and manages WebSocket lifecycle tied to React lifecycle.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { NexusClient, getNexusClient, StateUpdateCallback, NOGUpdateCallback } from '../api/NexusClient';

export interface NexusContextValue {
  /**
   * The NexusClient instance
   */
  client: NexusClient;

  /**
   * Whether the client is connected to workspace-kernel
   */
  isConnected: boolean;

  /**
   * Health status from workspace-kernel
   */
  health: any | null;

  /**
   * Error if connection failed
   */
  error: Error | null;

  /**
   * Reconnect to workspace-kernel
   */
  reconnect: () => Promise<void>;
}

const NexusContext = createContext<NexusContextValue | null>(null);

export interface NexusProviderProps {
  /**
   * Base URL for workspace-kernel
   * @default "http://localhost:3000"
   */
  baseUrl?: string;

  /**
   * Custom NexusClient instance (for testing)
   */
  client?: NexusClient;

  /**
   * Children to render
   */
  children: ReactNode;

  /**
   * Auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Heartbeat interval in ms (0 to disable)
   * @default 30000 (30 seconds)
   */
  heartbeatInterval?: number;
}

/**
 * NexusProvider - Provides NexusClient to the component tree
 */
export function NexusProvider({
  baseUrl = 'http://localhost:3000',
  client: providedClient,
  children,
  autoConnect = true,
  heartbeatInterval = 30000,
}: NexusProviderProps) {
  const [client] = useState<NexusClient>(() => providedClient || getNexusClient(baseUrl));
  const [isConnected, setIsConnected] = useState(false);
  const [health, setHealth] = useState<any | null>(null);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Check health and update connection status
   */
  const checkHealth = useCallback(async () => {
    try {
      const healthData = await client.getHealth();
      setHealth(healthData);
      setIsConnected(true);
      setError(null);
      return healthData;
    } catch (err) {
      console.error('[NexusContext] Health check failed:', err);
      setIsConnected(false);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [client]);

  /**
   * Reconnect to workspace-kernel
   */
  const reconnect = useCallback(async () => {
    console.log('[NexusContext] Reconnecting to workspace-kernel...');
    await checkHealth();
  }, [checkHealth]);

  /**
   * Initial connection and heartbeat
   */
  useEffect(() => {
    if (autoConnect) {
      checkHealth();
    }

    // Setup heartbeat
    if (heartbeatInterval > 0) {
      const intervalId = setInterval(() => {
        checkHealth().catch((err) => {
          console.error('[NexusContext] Heartbeat failed:', err);
        });
      }, heartbeatInterval);

      return () => clearInterval(intervalId);
    }
  }, [autoConnect, heartbeatInterval, checkHealth]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[NexusContext] Disconnecting all panels');
      client.disconnectAll();
    };
  }, [client]);

  const contextValue: NexusContextValue = {
    client,
    isConnected,
    health,
    error,
    reconnect,
  };

  return (
    <NexusContext.Provider value={contextValue}>
      {children}
    </NexusContext.Provider>
  );
}

/**
 * useNexus - Hook to access NexusContext
 */
export function useNexus(): NexusContextValue {
  const context = useContext(NexusContext);
  if (!context) {
    throw new Error('useNexus must be used within a NexusProvider');
  }
  return context;
}

/**
 * useNexusClient - Hook to access NexusClient directly
 */
export function useNexusClient(): NexusClient {
  const { client } = useNexus();
  return client;
}

/**
 * useNexusHealth - Hook to access health status
 */
export function useNexusHealth(): { health: any | null; isConnected: boolean; error: Error | null } {
  const { health, isConnected, error } = useNexus();
  return { health, isConnected, error };
}

/**
 * usePanelWebSocket - Hook to manage WebSocket connection for a panel
 */
export function usePanelWebSocket(panelId: string | null, autoConnect: boolean = true): {
  isConnected: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
} {
  const { client } = useNexus();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    if (!panelId) {
      setError(new Error('No panelId provided'));
      return;
    }

    try {
      await client.connectToPanel(panelId);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      console.error(`[usePanelWebSocket] Failed to connect to panel ${panelId}:`, err);
      setIsConnected(false);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [client, panelId]);

  const disconnect = useCallback(() => {
    if (panelId) {
      client.disconnectPanel(panelId);
      setIsConnected(false);
    }
  }, [client, panelId]);

  useEffect(() => {
    if (autoConnect && panelId) {
      connect();
    }

    return () => {
      if (panelId) {
        disconnect();
      }
    };
  }, [panelId, autoConnect, connect, disconnect]);

  useEffect(() => {
    if (panelId) {
      setIsConnected(client.isConnected(panelId));
    }
  }, [panelId, client]);

  return { isConnected, error, connect, disconnect };
}

/**
 * usePanelState - Hook to subscribe to panel state updates
 */
export function usePanelState(panelId: string | null): {
  state: Record<string, any> | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { client } = useNexus();
  const [state, setState] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!panelId) {
      setState(null);
      setIsLoading(false);
      return;
    }

    // Load initial state
    setIsLoading(true);
    client
      .getPanelState(panelId)
      .then((initialState) => {
        setState(initialState);
        setError(null);
      })
      .catch((err) => {
        console.error(`[usePanelState] Failed to load state for panel ${panelId}:`, err);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setIsLoading(false);
      });

    // Subscribe to state updates
    const unsubscribe = client.onStateUpdate(panelId, (newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [client, panelId]);

  return { state, isLoading, error };
}

/**
 * useNOGGraph - Hook to subscribe to NOG graph updates
 */
export function useNOGGraph(): {
  graph: any | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const { client } = useNexus();
  const [graph, setGraph] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const graphData = await client.getNOGGraph();
      setGraph(graphData);
      setError(null);
    } catch (err) {
      console.error('[useNOGGraph] Failed to load NOG graph:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    // Load initial graph
    refresh();

    // Subscribe to updates
    const unsubscribe = client.onNOGUpdate((snapshot) => {
      setGraph(snapshot);
    });

    return unsubscribe;
  }, [client, refresh]);

  return { graph, isLoading, error, refresh };
}

/**
 * usePanelTrigger - Hook to trigger tools on a panel
 */
export function usePanelTrigger(panelId: string | null): {
  trigger: (toolName: string, args?: Record<string, any>) => Promise<any>;
  isTriggering: boolean;
  error: Error | null;
} {
  const { client } = useNexus();
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trigger = useCallback(
    async (toolName: string, args?: Record<string, any>) => {
      if (!panelId) {
        const err = new Error('No panelId provided');
        setError(err);
        throw err;
      }

      setIsTriggering(true);
      setError(null);

      try {
        const result = await client.triggerTool(panelId, toolName, args);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsTriggering(false);
      }
    },
    [client, panelId]
  );

  return { trigger, isTriggering, error };
}
