/**
 * Panel lifecycle management
 * 
 * Handles creation, state management, and destruction of panels.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  PanelId,
  PanelConfig,
  PanelInstance,
  PanelState,
  PanelStatus,
  StateMutation,
  EmittedEvent,
  SuspensionContext,
  SuspensionDetails,
  WebSocketClient,
  ExecutionResult,
  PanelInfoResponse,
} from './types';
import { logger } from './logger';

/** Panel manager events */
export interface PanelManagerEvents {
  'panel:created': (panelId: PanelId) => void;
  'panel:destroyed': (panelId: PanelId) => void;
  'panel:state-changed': (panelId: PanelId, mutations: StateMutation[]) => void;
  'panel:event': (panelId: PanelId, event: EmittedEvent) => void;
  'panel:status-changed': (panelId: PanelId, status: PanelStatus) => void;
}

/**
 * Manages panel lifecycle and state
 */
export class PanelManager extends EventEmitter {
  private panels: Map<PanelId, PanelInstance> = new Map();
  private suspensionTimeout: number;

  constructor(options: { suspensionTimeoutMs?: number } = {}) {
    super();
    this.suspensionTimeout = options.suspensionTimeoutMs ?? 30000;
  }

  /**
   * Create a new panel
   */
  createPanel(config: Omit<PanelConfig, 'id'> & { id?: string }): PanelInstance {
    const id = config.id ?? `panel_${randomUUID().slice(0, 8)}`;

    if (this.panels.has(id)) {
      throw new Error(`Panel ${id} already exists`);
    }

    const now = new Date();
    const instance: PanelInstance = {
      config: { ...config, id },
      status: 'initializing',
      state: config.initialState ?? {},
      scope: {},
      clients: new Set(),
      suspensions: new Map(),
      createdAt: now,
      lastActivity: now,
    };

    this.panels.set(id, instance);

    // Set to running after initialization
    instance.status = 'running';

    logger.info({ panelId: id, kind: config.kind }, 'Panel created');
    this.emit('panel:created', id);
    this.emit('panel:status-changed', id, 'running');

    return instance;
  }

  /**
   * Get a panel by ID
   */
  getPanel(panelId: PanelId): PanelInstance | undefined {
    return this.panels.get(panelId);
  }

  /**
   * Check if a panel exists
   */
  hasPanel(panelId: PanelId): boolean {
    return this.panels.has(panelId);
  }

  /**
   * Get all panels
   */
  getAllPanels(): Map<PanelId, PanelInstance> {
    return new Map(this.panels);
  }

  /**
   * Get panel count
   */
  getPanelCount(): number {
    return this.panels.size;
  }

  /**
   * Destroy a panel
   */
  destroyPanel(panelId: PanelId): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) {
      return false;
    }

    // Clean up suspensions
    for (const [suspId, ctx] of panel.suspensions) {
      clearTimeout(ctx.timeout);
    }
    panel.suspensions.clear();

    // Close all client connections
    for (const client of panel.clients) {
      try {
        client.socket.close(1000, 'Panel destroyed');
      } catch {
        // Ignore close errors
      }
    }
    panel.clients.clear();

    // Update status and remove
    panel.status = 'stopped';
    this.panels.delete(panelId);

    logger.info({ panelId }, 'Panel destroyed');
    this.emit('panel:destroyed', panelId);

    return true;
  }

  /**
   * Get panel state
   */
  getState(panelId: PanelId): PanelState | undefined {
    return this.panels.get(panelId)?.state;
  }

  /**
   * Apply state mutations from execution result
   */
  applyMutations(panelId: PanelId, mutations: StateMutation[]): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      logger.warn({ panelId }, 'Cannot apply mutations: panel not found');
      return;
    }

    if (mutations.length === 0) {
      return;
    }

    for (const mutation of mutations) {
      if (mutation.op === 'set') {
        panel.state[mutation.key] = mutation.value;
      } else if (mutation.op === 'delete') {
        delete panel.state[mutation.key];
      }
    }

    panel.lastActivity = new Date();

    logger.debug(
      { panelId, mutationCount: mutations.length },
      'Applied state mutations'
    );

    this.emit('panel:state-changed', panelId, mutations);
  }

  /**
   * Emit an event from a panel
   */
  emitPanelEvent(panelId: PanelId, event: EmittedEvent): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      logger.warn({ panelId }, 'Cannot emit event: panel not found');
      return;
    }

    panel.lastActivity = new Date();
    this.emit('panel:event', panelId, event);
  }

  /**
   * Update panel status
   */
  setStatus(panelId: PanelId, status: PanelStatus): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      return;
    }

    if (panel.status !== status) {
      panel.status = status;
      panel.lastActivity = new Date();
      this.emit('panel:status-changed', panelId, status);
    }
  }

  /**
   * Register a suspension
   */
  registerSuspension(
    panelId: PanelId,
    handlerName: string,
    details: SuspensionDetails
  ): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel ${panelId} not found`);
    }

    // Set up timeout for suspension
    const timeout = setTimeout(() => {
      this.cancelSuspension(details.suspensionId, 'Suspension timeout');
    }, this.suspensionTimeout);

    const context: SuspensionContext = {
      details,
      panelId,
      handlerName,
      createdAt: new Date(),
      timeout,
    };

    panel.suspensions.set(details.suspensionId, context);
    panel.status = 'suspended';

    logger.debug(
      { panelId, suspensionId: details.suspensionId, extension: details.extensionName },
      'Suspension registered'
    );

    this.emit('panel:status-changed', panelId, 'suspended');
  }

  /**
   * Get suspension context
   */
  getSuspension(suspensionId: string): SuspensionContext | undefined {
    for (const panel of this.panels.values()) {
      const ctx = panel.suspensions.get(suspensionId);
      if (ctx) {
        return ctx;
      }
    }
    return undefined;
  }

  /**
   * Complete a suspension (remove from tracking)
   */
  completeSuspension(suspensionId: string): SuspensionContext | undefined {
    for (const panel of this.panels.values()) {
      const ctx = panel.suspensions.get(suspensionId);
      if (ctx) {
        clearTimeout(ctx.timeout);
        panel.suspensions.delete(suspensionId);

        // If no more suspensions, set back to running
        if (panel.suspensions.size === 0) {
          panel.status = 'running';
          this.emit('panel:status-changed', ctx.panelId, 'running');
        }

        logger.debug({ suspensionId }, 'Suspension completed');
        return ctx;
      }
    }
    return undefined;
  }

  /**
   * Cancel a suspension with error
   */
  cancelSuspension(suspensionId: string, reason: string): void {
    const ctx = this.completeSuspension(suspensionId);
    if (ctx) {
      logger.warn({ suspensionId, reason }, 'Suspension cancelled');
    }
  }

  /**
   * Add a WebSocket client to a panel
   */
  addClient(panelId: PanelId, client: WebSocketClient): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Panel ${panelId} not found`);
    }

    panel.clients.add(client);
    logger.debug({ panelId, clientId: client.id }, 'Client added to panel');
  }

  /**
   * Remove a WebSocket client from a panel
   */
  removeClient(panelId: PanelId, client: WebSocketClient): void {
    const panel = this.panels.get(panelId);
    if (!panel) {
      return;
    }

    panel.clients.delete(client);
    logger.debug({ panelId, clientId: client.id }, 'Client removed from panel');
  }

  /**
   * Get all clients for a panel
   */
  getClients(panelId: PanelId): Set<WebSocketClient> {
    return this.panels.get(panelId)?.clients ?? new Set();
  }

  /**
   * Update scope variable
   */
  setScope(panelId: PanelId, key: string, value: unknown): void {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.scope[key] = value;
    }
  }

  /**
   * Get scope variable
   */
  getScope(panelId: PanelId, key: string): unknown {
    return this.panels.get(panelId)?.scope[key];
  }

  /**
   * Get panel info for API response
   */
  getPanelInfo(panelId: PanelId): PanelInfoResponse | undefined {
    const panel = this.panels.get(panelId);
    if (!panel) {
      return undefined;
    }

    return {
      id: panel.config.id,
      kind: panel.config.kind,
      ...(panel.config.title !== undefined && { title: panel.config.title }),
      status: panel.status,
      state: panel.state,
      tools: panel.config.tools.map(t => t.name),
      createdAt: panel.createdAt.toISOString(),
      lastActivity: panel.lastActivity.toISOString(),
      clientCount: panel.clients.size,
    };
  }

  /**
   * Get all panels info for API response
   */
  listPanels(): PanelInfoResponse[] {
    const result: PanelInfoResponse[] = [];
    for (const [panelId] of this.panels) {
      const info = this.getPanelInfo(panelId);
      if (info) {
        result.push(info);
      }
    }
    return result;
  }

  /**
   * Get suspended panel count
   */
  getSuspendedCount(): number {
    let count = 0;
    for (const panel of this.panels.values()) {
      if (panel.status === 'suspended') {
        count++;
      }
    }
    return count;
  }

  /**
   * Shutdown all panels
   */
  async shutdown(): Promise<void> {
    logger.info({ panelCount: this.panels.size }, 'Shutting down panel manager');

    const panelIds = Array.from(this.panels.keys());
    for (const panelId of panelIds) {
      this.destroyPanel(panelId);
    }
  }
}

/** Singleton panel manager instance */
let panelManagerInstance: PanelManager | null = null;

/**
 * Get the panel manager instance
 */
export function getPanelManager(): PanelManager {
  if (!panelManagerInstance) {
    panelManagerInstance = new PanelManager();
  }
  return panelManagerInstance;
}

/**
 * Initialize panel manager with options
 */
export function initPanelManager(options?: { suspensionTimeoutMs?: number }): PanelManager {
  panelManagerInstance = new PanelManager(options);
  return panelManagerInstance;
}

/**
 * Reset panel manager (for testing)
 */
export function resetPanelManager(): void {
  if (panelManagerInstance) {
    panelManagerInstance.shutdown();
    panelManagerInstance = null;
  }
}
