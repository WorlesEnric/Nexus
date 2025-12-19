/**
 * NexusClient - WebSocket + HTTP Client for workspace-kernel
 *
 * Provides methods for:
 * - Panel lifecycle (create, destroy)
 * - WebSocket connections for real-time state sync
 * - NOG (Nexus Object Graph) operations
 * - Tool execution
 */

export interface PanelConfig {
  nxmlSource: string;
  initialState?: Record<string, any>;
}

export interface CreatePanelResponse {
  id: string;
  status: string;
  wsUrl: string;
}

export interface ServerMessage {
  type: 'CONNECTED' | 'PATCH' | 'EVENT' | 'RESULT' | 'ERROR' | 'PONG' | 'NOG_UPDATE';
  panelId?: string;
  state?: Record<string, any>;
  mutations?: any[];
  event?: any;
  result?: any;
  code?: string;
  message?: string;
  snapshot?: any;
}

export interface ClientMessage {
  type: 'TRIGGER' | 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PING';
  tool?: string;
  args?: any;
  requestId?: string;
  topics?: string[];
}

export interface NOGGraphSnapshot {
  entities: any[];
  relationships: any[];
  version: number;
}

export interface NOGPatch {
  id: string;
  operation: string;
  sourcePanel: string;
  targetPanel?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export type StateUpdateCallback = (state: Record<string, any>) => void;
export type NOGUpdateCallback = (snapshot: NOGGraphSnapshot) => void;

/**
 * NexusClient for communicating with workspace-kernel
 */
export class NexusClient {
  private baseUrl: string;
  private wsConnections: Map<string, WebSocket> = new Map();
  private stateCallbacks: Map<string, Set<StateUpdateCallback>> = new Map();
  private nogCallbacks: Set<NOGUpdateCallback> = new Set();
  private reconnectAttempts: Map<string, number> = new Map();
  private successfullyConnected: Set<string> = new Set(); // Track panels that were successfully connected
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get authentication token from localStorage
   */
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Create headers with optional authentication
   */
  private createHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  // =============================================================================
  // Panel Lifecycle
  // =============================================================================

  /**
   * Create a new panel runtime instance
   */
  async createPanel(config: PanelConfig): Promise<CreatePanelResponse> {
    const response = await fetch(`${this.baseUrl}/panels`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create panel: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new panel runtime instance from NXML source
   */
  async createPanelFromNXML(nxmlSource: string, initialState?: Record<string, any>): Promise<CreatePanelResponse> {
    const response = await fetch(`${this.baseUrl}/panels/from-nxml`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({ nxmlSource, initialState }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create panel from NXML: ${error.error || error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get panel info
   */
  async getPanelInfo(panelId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get panel info: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get panel state
   */
  async getPanelState(panelId: string): Promise<Record<string, any>> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}/state`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get panel state: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a panel runtime instance
   */
  async deletePanel(panelId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}`, {
      method: 'DELETE',
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete panel: ${response.statusText}`);
    }

    // Close WebSocket if open
    this.disconnectPanel(panelId);
  }

  /**
   * Trigger a tool on a panel (HTTP endpoint)
   */
  async triggerTool(panelId: string, toolName: string, args?: Record<string, any>): Promise<any> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}/trigger/${toolName}`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(args || {}),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to trigger tool: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  // =============================================================================
  // WebSocket Connections
  // =============================================================================

  /**
   * Connect to a panel via WebSocket for real-time updates
   */
  async connectToPanel(panelId: string, token?: string): Promise<WebSocket> {
    // Close existing connection if any
    this.disconnectPanel(panelId);

    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl(panelId, token);
      const ws = new WebSocket(wsUrl);
      let hasConnected = false;

      ws.onopen = () => {
        console.log(`[NexusClient] Connected to panel ${panelId}`);
        hasConnected = true;
        this.wsConnections.set(panelId, ws);
        this.successfullyConnected.add(panelId);
        this.reconnectAttempts.set(panelId, 0);
        resolve(ws);
      };

      ws.onerror = (error) => {
        console.error(`[NexusClient] WebSocket error for panel ${panelId}:`, error);
        if (!hasConnected) {
          reject(new Error(`Failed to connect to panel ${panelId}`));
        }
      };

      ws.onclose = (event) => {
        console.log(`[NexusClient] Disconnected from panel ${panelId}`, event.code, event.reason);
        this.wsConnections.delete(panelId);

        // Only auto-reconnect if:
        // 1. Not a clean close (code !== 1000)
        // 2. We were previously successfully connected (not initial connection failure)
        if (event.code !== 1000 && this.successfullyConnected.has(panelId)) {
          this.attemptReconnect(panelId, token);
        }
      };

      ws.onmessage = (event) => {
        this.handleWebSocketMessage(panelId, event.data);
      };
    });
  }

  /**
   * Disconnect from a panel's WebSocket
   */
  disconnectPanel(panelId: string): void {
    const ws = this.wsConnections.get(panelId);
    if (ws) {
      ws.close(1000, 'Client disconnect');
      this.wsConnections.delete(panelId);
    }
    this.stateCallbacks.delete(panelId);
    this.reconnectAttempts.delete(panelId);
    this.successfullyConnected.delete(panelId);
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnectAll(): void {
    for (const panelId of this.wsConnections.keys()) {
      this.disconnectPanel(panelId);
    }
    this.nogCallbacks.clear();
    this.successfullyConnected.clear();
  }

  /**
   * Check if connected to a panel
   */
  isConnected(panelId: string): boolean {
    const ws = this.wsConnections.get(panelId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Attempt to reconnect to a panel
   */
  private async attemptReconnect(panelId: string, token?: string): Promise<void> {
    const attempts = this.reconnectAttempts.get(panelId) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.error(`[NexusClient] Max reconnect attempts reached for panel ${panelId}`);
      return;
    }

    this.reconnectAttempts.set(panelId, attempts + 1);
    const delay = this.reconnectDelay * Math.pow(2, attempts); // Exponential backoff

    console.log(`[NexusClient] Reconnecting to panel ${panelId} in ${delay}ms (attempt ${attempts + 1})`);

    setTimeout(() => {
      this.connectToPanel(panelId, token).catch((error) => {
        console.error(`[NexusClient] Reconnect failed for panel ${panelId}:`, error);
      });
    }, delay);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(panelId: string, data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.type) {
        case 'CONNECTED':
          console.log(`[NexusClient] Panel ${panelId} connected with initial state:`, message.state);
          this.notifyStateUpdate(panelId, message.state || {});
          break;

        case 'PATCH':
          console.log(`[NexusClient] State patch for panel ${panelId}:`, message.mutations);
          // Mutations will be applied by workspace-kernel, we'll get updated state
          break;

        case 'EVENT':
          console.log(`[NexusClient] Event from panel ${panelId}:`, message.event);
          break;

        case 'RESULT':
          console.log(`[NexusClient] Tool execution result for panel ${panelId}:`, message.result);
          break;

        case 'ERROR':
          console.error(`[NexusClient] Error from panel ${panelId}:`, message.code, message.message);
          break;

        case 'NOG_UPDATE':
          console.log(`[NexusClient] NOG update:`, message.snapshot);
          this.notifyNOGUpdate(message.snapshot);
          break;

        case 'PONG':
          // Heartbeat response
          break;

        default:
          console.warn(`[NexusClient] Unknown message type:`, message);
      }
    } catch (error) {
      console.error(`[NexusClient] Failed to parse WebSocket message:`, error);
    }
  }

  /**
   * Subscribe to state updates for a panel
   */
  onStateUpdate(panelId: string, callback: StateUpdateCallback): () => void {
    if (!this.stateCallbacks.has(panelId)) {
      this.stateCallbacks.set(panelId, new Set());
    }
    this.stateCallbacks.get(panelId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.stateCallbacks.get(panelId)?.delete(callback);
    };
  }

  /**
   * Subscribe to NOG updates
   */
  onNOGUpdate(callback: NOGUpdateCallback): () => void {
    this.nogCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.nogCallbacks.delete(callback);
    };
  }

  /**
   * Notify all subscribers of a state update
   */
  private notifyStateUpdate(panelId: string, state: Record<string, any>): void {
    const callbacks = this.stateCallbacks.get(panelId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(state));
    }
  }

  /**
   * Notify all subscribers of a NOG update
   */
  private notifyNOGUpdate(snapshot: NOGGraphSnapshot): void {
    this.nogCallbacks.forEach((callback) => callback(snapshot));
  }

  /**
   * Send a message through WebSocket
   */
  private sendMessage(panelId: string, message: ClientMessage): void {
    const ws = this.wsConnections.get(panelId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(`[NexusClient] Cannot send message, panel ${panelId} not connected`);
      return;
    }

    ws.send(JSON.stringify(message));
  }

  /**
   * Trigger a tool via WebSocket
   */
  triggerToolWS(panelId: string, toolName: string, args?: any, requestId?: string): void {
    this.sendMessage(panelId, {
      type: 'TRIGGER',
      tool: toolName,
      args,
      requestId,
    });
  }

  /**
   * Subscribe to WebSocket topics
   */
  subscribe(panelId: string, topics: string[]): void {
    this.sendMessage(panelId, {
      type: 'SUBSCRIBE',
      topics,
    });
  }

  /**
   * Unsubscribe from WebSocket topics
   */
  unsubscribe(panelId: string, topics: string[]): void {
    this.sendMessage(panelId, {
      type: 'UNSUBSCRIBE',
      topics,
    });
  }

  /**
   * Send ping to keep connection alive
   */
  ping(panelId: string): void {
    this.sendMessage(panelId, {
      type: 'PING',
    });
  }

  // =============================================================================
  // NOG Operations
  // =============================================================================

  /**
   * Get the complete NOG graph
   */
  async getNOGGraph(): Promise<NOGGraphSnapshot> {
    const response = await fetch(`${this.baseUrl}/state/graph`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get NOG graph: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get NOG status
   */
  async getNOGStatus(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/state/status`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get NOG status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get entities by panel
   */
  async getEntitiesByPanel(panelId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/state/entities?panel=${panelId}`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get entities: ${response.statusText}`);
    }

    const data = await response.json();
    return data.entities;
  }

  /**
   * Get entities by category
   */
  async getEntitiesByCategory(category: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/state/entities?category=${category}`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get entities: ${response.statusText}`);
    }

    const data = await response.json();
    return data.entities;
  }

  /**
   * Get a specific entity with relationships
   */
  async getEntity(entityId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/state/entities/${entityId}`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get entity: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Apply patches to the NOG
   */
  async applyPatches(patches: NOGPatch[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/state/patches`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({ patches }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to apply patches: ${error.error || response.statusText}`);
    }
  }

  /**
   * Force persist state to disk/git
   */
  async forcePersist(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/state/persist`, {
      method: 'POST',
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to persist state: ${error.error || response.statusText}`);
    }
  }

  // =============================================================================
  // AI Operations (NexusOS Integration)
  // =============================================================================

  /**
   * Request AI assistance to modify panels
   * Calls NexusOS service to generate patches from user request
   */
  async requestAIAssistance(
    userRequest: string,
    panelId?: string
  ): Promise<{
    patches: NOGPatch[];
    rawResponse: string;
    confidence: number;
    warnings: string[];
  }> {
    const nexusOSUrl = import.meta.env.VITE_NEXUS_OS_URL || 'http://localhost:4000';

    // Get current NOG graph
    const nogGraph = await this.getNOGGraph();

    const response = await fetch(`${nexusOSUrl}/ai/complete`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({
        nogGraph,
        userRequest,
        panelId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`AI assistance failed: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Build context for LLM without making full AI call
   * Useful for debugging or manual prompt engineering
   */
  async buildContext(
    userRequest: string,
    panelId?: string
  ): Promise<{
    context: any;
    tokenCount: number;
  }> {
    const nexusOSUrl = import.meta.env.VITE_NEXUS_OS_URL || 'http://localhost:4000';
    const nogGraph = await this.getNOGGraph();

    const response = await fetch(`${nexusOSUrl}/context/build`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({
        nogGraph,
        userRequest,
        panelId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to build context: ${response.statusText}`);
    }

    return response.json();
  }

  // =============================================================================
  // Workspace Operations
  // =============================================================================

  /**
   * List user's workspaces
   */
  async listWorkspaces(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list workspaces: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get workspace: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(name: string, description?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create workspace: ${error.detail || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Activate a workspace (load runtime resources)
   */
  async activateWorkspace(workspaceId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}/activate`, {
      method: 'POST',
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to activate workspace: ${response.statusText}`);
    }
  }

  /**
   * Update workspace details
   */
  async updateWorkspace(
    workspaceId: string,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: this.createHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update workspace: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete workspace: ${response.statusText}`);
    }
  }

  /**
   * Get workspace commit history
   */
  async getWorkspaceCommits(workspaceId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}/commits`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get workspace commits: ${response.statusText}`);
    }

    return response.json();
  }

  // =============================================================================
  // Utilities
  // =============================================================================

  /**
   * Get WebSocket URL for a panel
   */
  private getWebSocketUrl(panelId: string, token?: string): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    let url = `${wsProtocol}://${host}/panels/${panelId}/ws`;

    if (token) {
      url += `?token=${encodeURIComponent(token)}`;
    }

    return url;
  }

  /**
   * Get health status of workspace-kernel
   */
  async getHealth(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get health: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Create a singleton NexusClient instance
 */
let globalClient: NexusClient | null = null;

export function getNexusClient(baseUrl?: string): NexusClient {
  if (!globalClient) {
    globalClient = new NexusClient(baseUrl);
  }
  return globalClient;
}

export function setNexusClient(client: NexusClient): void {
  globalClient = client;
}
