/**
 * NexusOS Server - AI Context Builder & Patch Generator
 *
 * Provides three main endpoints:
 * 1. POST /context/build - Build LLM context from NOG graph
 * 2. POST /patch/generate - Generate patches from LLM response
 * 3. POST /ai/complete - Full pipeline (context + LLM + patches)
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import pino from 'pino';
import { buildContext, estimateTokens } from './context-builder';
import { generatePatches } from './patch-generator';
import { createLLMClient } from './llm-client';
import type {
  BuildContextRequest,
  BuildContextResponse,
  GeneratePatchRequest,
  GeneratePatchResponse,
  AICompleteRequest,
  AICompleteResponse,
} from './types';

// Load environment variables
config();

// Setup logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

// Create Express app
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Create LLM client
const llmClient = createLLMClient();

// =============================================================================
// Health Check
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexusOS',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Endpoint 1: Build Context
// =============================================================================

app.post('/context/build', (req, res) => {
  try {
    const { nogGraph, userRequest, panelId } = req.body as BuildContextRequest;

    logger.info({ panelId }, 'Building context');

    const context = buildContext(nogGraph, userRequest, panelId);
    const tokenCount = estimateTokens(context);

    const response: BuildContextResponse = {
      context,
      tokenCount,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to build context');
    res.status(500).json({
      error: 'Failed to build context',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Endpoint 2: Generate Patches
// =============================================================================

app.post('/patch/generate', (req, res) => {
  try {
    const { llmResponse, context } = req.body as GeneratePatchRequest;

    logger.info({ panelId: context.panelId }, 'Generating patches');

    const result = generatePatches(llmResponse, context);

    const response: GeneratePatchResponse = {
      patches: result.patches,
      confidence: result.confidence,
      warnings: result.warnings,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to generate patches');
    res.status(500).json({
      error: 'Failed to generate patches',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Endpoint 3: AI Complete (Full Pipeline)
// =============================================================================

app.post('/ai/complete', async (req, res) => {
  try {
    const { nogGraph, userRequest, panelId } = req.body as AICompleteRequest;

    logger.info({ panelId, userRequest }, 'Running full AI pipeline');

    // Step 1: Build context
    const context = buildContext(nogGraph, userRequest, panelId);
    logger.debug({ tokenCount: estimateTokens(context) }, 'Context built');

    // Step 2: Call LLM
    const llmResponse = await llmClient.complete({
      messages: [
        {
          role: 'system',
          content: context.systemPrompt,
        },
        {
          role: 'user',
          content: `# Current Workspace\n\n${context.userContext}\n\n# User Request\n\n${userRequest}\n\n# Constraints\n\n${context.constraints.join('\n')}`,
        },
      ],
      temperature: 0.7,
      maxTokens: 4096,
    });

    logger.debug({ responseLength: llmResponse.content.length }, 'LLM response received');

    // Step 3: Generate patches
    const patchContext = {
      panelId: panelId || 'default',
      currentEntities: nogGraph.entities.filter((e) =>
        panelId ? e.sourcePanel === panelId : true
      ),
    };

    const result = generatePatches(llmResponse.content, patchContext);

    logger.info(
      {
        patchCount: result.patches.length,
        confidence: result.confidence,
        warnings: result.warnings.length,
      },
      'Patches generated'
    );

    const response: AICompleteResponse = {
      patches: result.patches,
      rawResponse: llmResponse.content,
      contextUsed: context,
      confidence: result.confidence,
      warnings: result.warnings,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'AI complete pipeline failed');
    res.status(500).json({
      error: 'AI complete pipeline failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Start Server
// =============================================================================

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || 'localhost';

app.listen(Number(PORT), HOST, () => {
  logger.info({ port: PORT, host: HOST }, 'NexusOS server started');
  logger.info('Available endpoints:');
  logger.info('  GET  /health');
  logger.info('  POST /context/build');
  logger.info('  POST /patch/generate');
  logger.info('  POST /ai/complete');
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down NexusOS server');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down NexusOS server');
  process.exit(0);
});
