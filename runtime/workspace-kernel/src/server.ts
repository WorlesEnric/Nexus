/**
 * HTTP and WebSocket Server
 * 
 * Provides REST API and WebSocket endpoints for panel management.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

import type {
  ServerConfig,
  AppConfig,
  ClientMessage,
  ServerMessage,
  WebSocketClient,
  CreatePanelRequest,
  CreatePanelResponse,
  PanelInfoResponse,
  ListPanelsResponse,
  HealthResponse,
  ExecutionContext,
  AsyncResult,
  PanelConfig,
} from './types';
import { CreatePanelRequestSchema } from './types';
import { getPanelManager, PanelManager } from './panel';
import { getExecutor, WasmExecutor } from './executor';
import { getExtensionManager, ExtensionManager } from './extensions';
import { logger } from './logger';
import { StateEngine, createStateEngine } from './state';
import { createMarketplaceRouter } from './marketplace/marketplace-router';

/** Server instance */
export class Server {
  private app: Express;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private config: ServerConfig;
  private panelManager: PanelManager;
  private executor: WasmExecutor;
  private extensionManager: ExtensionManager;
  private stateEngine: StateEngine | null = null;
  private startTime: Date;
  private clients: Map<string, WebSocketClient> = new Map();
  private prisma: PrismaClient;

  constructor(config: AppConfig) {
    this.config = config.server;
    this.panelManager = getPanelManager();
    this.executor = getExecutor();
    this.extensionManager = getExtensionManager();
    this.startTime = new Date();

    // Initialize Prisma
    this.prisma = new PrismaClient();

    // Create Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // Create HTTP server
    this.httpServer = createServer(this.app);

    // Create WebSocket server
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: this.config.bodyLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.bodyLimit }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(
          {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration,
          },
          'HTTP request'
        );
      });
      next();
    });

    // Authentication middleware
    if (this.config.authEnabled) {
      this.app.use(this.authMiddleware.bind(this));
    }
  }

  /**
   * Authentication middleware
   */
  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Skip auth for health check and auth routes
    if (req.path === '/health' || req.path.startsWith('/auth/')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      jwt.verify(token, this.config.jwtSecret!);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', this.handleHealth.bind(this));

    // Authentication routes (public, not protected by auth middleware)
    this.app.post('/auth/token', this.handleLogin.bind(this));
    this.app.post('/auth/signup', this.handleSignup.bind(this));
    this.app.get('/auth/me', this.handleGetMe.bind(this));

    // Metrics
    this.app.get('/metrics', this.handleMetrics.bind(this));

    // Panel CRUD
    this.app.post('/panels', this.handleCreatePanel.bind(this));
    this.app.get('/panels', this.handleListPanels.bind(this));
    this.app.get('/panels/:id', this.handleGetPanel.bind(this));
    this.app.get('/panels/:id/state', this.handleGetPanelState.bind(this));
    this.app.delete('/panels/:id', this.handleDeletePanel.bind(this));

    // Trigger handler execution
    this.app.post('/panels/:id/trigger/:tool', this.handleTrigger.bind(this));

    // State Engine API
    this.app.get('/state/status', this.handleStateStatus.bind(this));
    this.app.get('/state/graph', this.handleGetGraph.bind(this));
    this.app.get('/state/entities', this.handleGetEntities.bind(this));
    this.app.get('/state/entities/:id', this.handleGetEntity.bind(this));
    this.app.post('/state/patches', this.handleApplyPatch.bind(this));
    this.app.post('/state/persist', this.handleForcePersist.bind(this));

    // Marketplace API
    const marketplaceRouter = createMarketplaceRouter(this.prisma, this.config.jwtSecret!);
    this.app.use('/marketplace', marketplaceRouter);

    // Error handler
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    // Handle upgrade on HTTP server
    this.httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const match = url.pathname.match(/^\/panels\/([^/]+)\/ws$/);

      if (!match || !match[1]) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      const panelId = match[1];

      // Check if panel exists
      if (!this.panelManager.hasPanel(panelId)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Authenticate if enabled
      if (this.config.authEnabled) {
        const token = url.searchParams.get('token');
        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        try {
          jwt.verify(token, this.config.jwtSecret!);
        } catch {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      // Accept the WebSocket connection
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, panelId);
      });
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, panelId: string): void {
    const clientId = `client_${randomUUID().slice(0, 8)}`;

    const client: WebSocketClient = {
      id: clientId,
      socket: ws,
      panelId,
      subscriptions: new Set(['state', 'events']), // Default subscriptions
      authenticated: true,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);
    this.panelManager.addClient(panelId, client);

    logger.info({ clientId, panelId }, 'WebSocket client connected');

    // Send connected message with current state
    const panel = this.panelManager.getPanel(panelId);
    this.sendToClient(client, {
      type: 'CONNECTED',
      panelId,
      state: panel?.state ?? {},
    });

    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(client, data.toString());
    });

    // Handle close
    ws.on('close', () => {
      this.clients.delete(clientId);
      this.panelManager.removeClient(panelId, client);
      logger.info({ clientId, panelId }, 'WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (err) => {
      logger.error({ clientId, error: err.message }, 'WebSocket error');
    });
  }

  /**
   * Handle WebSocket message
   */
  private async handleMessage(client: WebSocketClient, data: string): Promise<void> {
    try {
      const message: ClientMessage = JSON.parse(data);

      switch (message.type) {
        case 'TRIGGER':
          await this.handleWsTrigger(client, message.tool, message.args, message.requestId);
          break;

        case 'SUBSCRIBE':
          for (const topic of message.topics) {
            client.subscriptions.add(topic);
          }
          break;

        case 'UNSUBSCRIBE':
          for (const topic of message.topics) {
            client.subscriptions.delete(topic);
          }
          break;

        case 'PING':
          this.sendToClient(client, { type: 'PONG' });
          break;

        default:
          this.sendToClient(client, {
            type: 'ERROR',
            code: 'UNKNOWN_MESSAGE',
            message: `Unknown message type`,
          });
      }
    } catch (err) {
      logger.error(
        { clientId: client.id, error: err instanceof Error ? err.message : String(err) },
        'Error handling WebSocket message'
      );
      this.sendToClient(client, {
        type: 'ERROR',
        code: 'PARSE_ERROR',
        message: 'Invalid message format',
      });
    }
  }

  /**
   * Handle trigger via WebSocket
   */
  private async handleWsTrigger(
    client: WebSocketClient,
    tool: string,
    args: unknown,
    requestId?: string
  ): Promise<void> {
    const panel = this.panelManager.getPanel(client.panelId);
    if (!panel) {
      this.sendToClient(client, {
        type: 'ERROR',
        code: 'PANEL_NOT_FOUND',
        message: `Panel ${client.panelId} not found`,
      });
      return;
    }

    const toolDef = panel.config.tools.find((t) => t.name === tool);
    if (!toolDef) {
      this.sendToClient(client, {
        type: 'ERROR',
        code: 'TOOL_NOT_FOUND',
        message: `Tool ${tool} not found`,
      });
      return;
    }

    // Execute handler
    const context: ExecutionContext = {
      panelId: client.panelId,
      handlerName: tool,
      state: panel.state,
      args,
      scope: panel.scope,
      capabilities: toolDef.capabilities ?? panel.config.capabilities ?? [],
    };

    try {
      const result = await this.executor.execute(toolDef.handler, context);

      // Apply mutations immediately (for UI responsiveness)
      if (result.stateMutations.length > 0) {
        this.panelManager.applyMutations(client.panelId, result.stateMutations);
        this.broadcastToPanel(client.panelId, {
          type: 'PATCH',
          mutations: result.stateMutations,
        });
      }

      // Emit events
      for (const event of result.events) {
        this.panelManager.emitPanelEvent(client.panelId, event);
        this.broadcastToPanel(client.panelId, {
          type: 'EVENT',
          event,
        });
      }

      // Handle suspension
      if (result.status === 'suspended' && result.suspension) {
        this.panelManager.registerSuspension(client.panelId, tool, result.suspension);
        
        // Execute the extension call
        this.executeExtensionCall(result.suspension);
      }

      // Send result to the triggering client
      this.sendToClient(client, {
        type: 'RESULT',
        ...(requestId !== undefined && { requestId }),
        result,
      });
    } catch (err) {
      logger.error(
        { panelId: client.panelId, tool, error: err instanceof Error ? err.message : String(err) },
        'Handler execution failed'
      );
      this.sendToClient(client, {
        type: 'ERROR',
        code: 'EXECUTION_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Execute an extension call and resume the suspended handler
   */
  private async executeExtensionCall(suspension: NonNullable<import('./types').ExecutionResult['suspension']>): Promise<void> {
    const { suspensionId, extensionName, method, args } = suspension;

    try {
      const value = await this.extensionManager.call(extensionName, method, args);

      // Resume the handler
      const result = await this.executor.resume(suspensionId, {
        success: true,
        value,
      });

      // Get the suspension context to know which panel
      const ctx = this.panelManager.completeSuspension(suspensionId);
      if (ctx) {
        // Apply any new mutations
        if (result.stateMutations.length > 0) {
          this.panelManager.applyMutations(ctx.panelId, result.stateMutations);
          this.broadcastToPanel(ctx.panelId, {
            type: 'PATCH',
            mutations: result.stateMutations,
          });
        }

        // Emit events
        for (const event of result.events) {
          this.panelManager.emitPanelEvent(ctx.panelId, event);
          this.broadcastToPanel(ctx.panelId, {
            type: 'EVENT',
            event,
          });
        }

        // Broadcast result
        this.broadcastToPanel(ctx.panelId, {
          type: 'RESULT',
          result,
        });
      }
    } catch (err) {
      // Resume with error
      const asyncResult: AsyncResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };

      try {
        const result = await this.executor.resume(suspensionId, asyncResult);
        const ctx = this.panelManager.completeSuspension(suspensionId);

        if (ctx) {
          this.broadcastToPanel(ctx.panelId, {
            type: 'RESULT',
            result,
          });
        }
      } catch (resumeErr) {
        logger.error(
          { suspensionId, error: resumeErr instanceof Error ? resumeErr.message : String(resumeErr) },
          'Failed to resume handler with error'
        );
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: WebSocketClient, message: ServerMessage): void {
    try {
      if (client.socket.readyState === 1) { // OPEN
        client.socket.send(JSON.stringify(message));
      }
    } catch (err) {
      logger.error(
        { clientId: client.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to send message to client'
      );
    }
  }

  /**
   * Broadcast message to all clients of a panel
   */
  private broadcastToPanel(panelId: string, message: ServerMessage): void {
    const clients = this.panelManager.getClients(panelId);
    for (const client of clients) {
      this.sendToClient(client, message);
    }
  }

  // === HTTP Handlers ===

  /**
   * POST /auth/token
   * Login endpoint - returns JWT token
   */
  private async handleLogin(req: Request, res: Response): Promise<void> {
    try {
      // Support both form-data (OAuth2PasswordRequestForm) and JSON
      let email: string;
      let password: string;

      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        // Form data format (OAuth2PasswordRequestForm uses 'username' for email)
        email = req.body.username || req.body.email;
        password = req.body.password;
      } else {
        // JSON format
        email = req.body.email || req.body.username;
        password = req.body.password;
      }

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.isActive) {
        res.status(401).json({ error: 'Incorrect email or password' });
        return;
      }

      const passwordValid = await bcrypt.compare(password, user.hashedPassword);
      if (!passwordValid) {
        res.status(401).json({ error: 'Incorrect email or password' });
        return;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        this.config.jwtSecret!,
        { expiresIn: '7d' }
      );

      res.json({
        access_token: token,
        token_type: 'bearer',
      });
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Login failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /auth/signup
   * Signup endpoint - creates new user
   */
  private async handleSignup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, full_name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email,
          hashedPassword,
          fullName: full_name || null,
          isActive: true,
        },
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        this.config.jwtSecret!,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        access_token: token,
        token_type: 'bearer',
      });
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Signup failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /auth/me
   * Get current user info
   */
  private async handleGetMe(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing authorization header' });
        return;
      }

      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, this.config.jwtSecret!) as { userId: string; email: string };

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          createdAt: true,
          isActive: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Get me failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private handleHealth(_req: Request, res: Response): void {
    const stats = this.executor.getStats();
    const panelCount = this.panelManager.getPanelCount();
    const suspendedCount = this.panelManager.getSuspendedCount();

    const response: HealthResponse = {
      status: 'healthy',
      version: '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      panels: {
        active: panelCount,
        suspended: suspendedCount,
      },
      runtime: {
        activeInstances: stats.activeInstances,
        availableInstances: stats.availableInstances,
        cacheHitRate: stats.cacheHitRate,
        memoryBytes: stats.totalMemoryBytes,
      },
    };

    res.json(response);
  }

  private handleMetrics(_req: Request, res: Response): void {
    const metrics = this.executor.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  }

  private handleCreatePanel(req: Request, res: Response): void {
    try {
      const parsed = CreatePanelRequestSchema.parse(req.body);

      // Clean tools array to remove undefined optional properties
      const cleanedTools = parsed.tools.map(tool => ({
        name: tool.name,
        handler: tool.handler,
        trigger: tool.trigger,
        ...(tool.description !== undefined && { description: tool.description }),
        ...(tool.capabilities !== undefined && { capabilities: tool.capabilities }),
      }));

      // Clean undefined values for strict optional types
      const cleanedConfig: Omit<PanelConfig, 'id'> & { id?: string } = {
        kind: parsed.kind,
        ...(parsed.id !== undefined && { id: parsed.id }),
        ...(parsed.title !== undefined && { title: parsed.title }),
        tools: cleanedTools,
        ...(parsed.initialState !== undefined && { initialState: parsed.initialState }),
        ...(parsed.capabilities !== undefined && { capabilities: parsed.capabilities }),
        ...(parsed.metadata !== undefined && { metadata: parsed.metadata }),
      };

      const panel = this.panelManager.createPanel(cleanedConfig);

      const response: CreatePanelResponse = {
        id: panel.config.id,
        status: panel.status,
        wsUrl: `ws://${req.headers.host}/panels/${panel.config.id}/ws`,
      };

      res.status(201).json(response);
    } catch (err) {
      if (err instanceof Error && err.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid request body', details: err });
      } else {
        throw err;
      }
    }
  }

  private handleListPanels(_req: Request, res: Response): void {
    const panels = this.panelManager.listPanels();

    const response: ListPanelsResponse = {
      panels,
      total: panels.length,
    };

    res.json(response);
  }

  private handleGetPanel(req: Request, res: Response): void {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing panel id parameter' });
      return;
    }

    const info = this.panelManager.getPanelInfo(id);

    if (!info) {
      res.status(404).json({ error: 'Panel not found' });
      return;
    }

    res.json(info);
  }

  private handleGetPanelState(req: Request, res: Response): void {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing panel id parameter' });
      return;
    }

    const state = this.panelManager.getState(id);

    if (state === undefined) {
      res.status(404).json({ error: 'Panel not found' });
      return;
    }

    res.json(state);
  }

  private handleDeletePanel(req: Request, res: Response): void {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing panel id parameter' });
      return;
    }

    const deleted = this.panelManager.destroyPanel(id);

    if (!deleted) {
      res.status(404).json({ error: 'Panel not found' });
      return;
    }

    res.status(204).send();
  }

  private async handleTrigger(req: Request, res: Response): Promise<void> {
    const { id, tool } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing panel id parameter' });
      return;
    }
    if (!tool) {
      res.status(400).json({ error: 'Missing tool parameter' });
      return;
    }

    const args = req.body;

    const panel = this.panelManager.getPanel(id);
    if (!panel) {
      res.status(404).json({ error: 'Panel not found' });
      return;
    }

    const toolDef = panel.config.tools.find((t) => t.name === tool);
    if (!toolDef) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }

    const context: ExecutionContext = {
      panelId: id,
      handlerName: tool,
      state: panel.state,
      args,
      scope: panel.scope,
      capabilities: toolDef.capabilities ?? panel.config.capabilities ?? [],
    };

    try {
      const result = await this.executor.execute(toolDef.handler, context);

      // Apply mutations
      if (result.stateMutations.length > 0) {
        this.panelManager.applyMutations(id, result.stateMutations);
        this.broadcastToPanel(id, {
          type: 'PATCH',
          mutations: result.stateMutations,
        });
      }

      // Emit events
      for (const event of result.events) {
        this.panelManager.emitPanelEvent(id, event);
        this.broadcastToPanel(id, {
          type: 'EVENT',
          event,
        });
      }

      // Handle suspension
      if (result.status === 'suspended' && result.suspension) {
        this.panelManager.registerSuspension(id, tool, result.suspension);
        this.executeExtensionCall(result.suspension);
      }

      res.json(result);
    } catch (err) {
      logger.error(
        { panelId: id, tool, error: err instanceof Error ? err.message : String(err) },
        'Handler execution failed'
      );
      res.status(500).json({
        error: 'Execution failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  }

  // ===========================================================================
  // State Engine Handlers
  // ===========================================================================

  /**
   * GET /state/status
   * Get State Engine status
   */
  private handleStateStatus(_req: Request, res: Response): void {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    const status = this.stateEngine.getStatus();
    res.json(status);
  }

  /**
   * GET /state/graph
   * Get the entire NOG graph
   */
  private handleGetGraph(_req: Request, res: Response): void {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    const snapshot = this.stateEngine.getSnapshot();
    res.json(snapshot);
  }

  /**
   * GET /state/entities
   * Get all entities (optionally filtered by panel or category)
   */
  private handleGetEntities(req: Request, res: Response): void {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    const { panel, category } = req.query;

    let entities;

    if (panel && typeof panel === 'string') {
      entities = this.stateEngine.findEntitiesByPanel(panel);
    } else if (category && typeof category === 'string') {
      entities = this.stateEngine.findEntitiesByCategory(category as any);
    } else {
      const graph = this.stateEngine.getGraph();
      entities = Array.from(graph.entities.values());
    }

    res.json({ entities });
  }

  /**
   * GET /state/entities/:id
   * Get a specific entity with relationships
   */
  private handleGetEntity(req: Request, res: Response): void {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing entity id parameter' });
      return;
    }

    const entityWithRels = this.stateEngine.getEntityWithRelationships(id);

    if (!entityWithRels) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    res.json(entityWithRels);
  }

  /**
   * POST /state/patches
   * Apply one or more patches to the NOG
   */
  private async handleApplyPatch(req: Request, res: Response): Promise<void> {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    try {
      const { patches } = req.body;

      if (!patches || !Array.isArray(patches)) {
        res.status(400).json({ error: 'Invalid request body. Expected { patches: [] }' });
        return;
      }

      await this.stateEngine.applyPatches(patches);

      res.json({
        success: true,
        appliedCount: patches.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to apply patches');
      res.status(500).json({
        error: 'Failed to apply patches',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * POST /state/persist
   * Force immediate persistence (bypass debounce)
   */
  private async handleForcePersist(_req: Request, res: Response): Promise<void> {
    if (!this.stateEngine) {
      res.status(503).json({ error: 'State Engine not initialized' });
      return;
    }

    try {
      await this.stateEngine.forcePersist();

      res.json({
        success: true,
        message: 'State persisted successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to force persist');
      res.status(500).json({
        error: 'Failed to persist state',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ===========================================================================
  // State Engine Lifecycle
  // ===========================================================================

  /**
   * Initialize the State Engine
   */
  async initializeStateEngine(workspaceId: string, workspaceName: string, workspaceRoot: string): Promise<void> {
    try {
      logger.info({ workspaceId, workspaceName, workspaceRoot }, 'Initializing State Engine');

      this.stateEngine = await createStateEngine({
        workspaceId,
        workspaceName,
        workspaceRoot,
        sync: {
          debounceDelay: 1000,
          autoCommit: true,
        },
      });

      // Setup event listeners
      this.stateEngine.on('graph:updated', (graph) => {
        // Broadcast NOG updates to all connected clients
        this.broadcastNOGUpdate();
      });

      this.stateEngine.on('sync:completed', (filesWritten, commitHash) => {
        logger.info({ filesWritten, commitHash }, 'State Engine sync completed');
      });

      logger.info({ workspaceId }, 'State Engine initialized successfully');
    } catch (error) {
      logger.error({ error, workspaceId }, 'Failed to initialize State Engine');
      throw error;
    }
  }

  /**
   * Broadcast NOG update to all connected clients
   */
  private broadcastNOGUpdate(): void {
    if (!this.stateEngine) return;

    const snapshot = this.stateEngine.getSnapshot();

    for (const client of this.clients.values()) {
      this.sendToClient(client, {
        type: 'NOG_UPDATE',
        snapshot,
      });
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.httpPort, this.config.host, () => {
        logger.info(
          { port: this.config.httpPort, host: this.config.host },
          'HTTP server started'
        );
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping server');

    // Close all WebSocket connections
    for (const client of this.clients.values()) {
      try {
        client.socket.close(1000, 'Server shutting down');
      } catch {
        // Ignore
      }
    }
    this.clients.clear();

    // Close WebSocket server
    this.wss.close();

    // Disconnect Prisma
    await this.prisma.$disconnect();

    // Close HTTP server
    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Get the Express app (for testing)
   */
  getApp(): Express {
    return this.app;
  }
}
