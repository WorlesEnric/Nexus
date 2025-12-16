/**
 * NexusOS Type Definitions
 *
 * Defines request/response types for the NexusOS service
 */

import type { NOGGraph, NOGEntity, NOGPatch } from '@nexus/protocol';

// =============================================================================
// LLM Context Types
// =============================================================================

export interface LLMContext {
  /** System prompt defining AI role and capabilities */
  systemPrompt: string;

  /** Current state of panels and NOG graph */
  userContext: string;

  /** User's request or intention */
  userRequest: string;

  /** NXML schema rules and constraints */
  constraints: string[];

  /** Available tools from panels */
  availableTools?: string[];
}

// =============================================================================
// Context Builder Types
// =============================================================================

export interface BuildContextRequest {
  /** NOG graph from workspace-kernel */
  nogGraph: NOGGraph;

  /** User's request */
  userRequest: string;

  /** Optional panel ID to focus on */
  panelId?: string;
}

export interface BuildContextResponse {
  /** Compiled context for LLM */
  context: LLMContext;

  /** Estimated token count */
  tokenCount: number;
}

// =============================================================================
// Patch Generator Types
// =============================================================================

export interface PatchContext {
  /** Target panel ID */
  panelId: string;

  /** Current entities in NOG */
  currentEntities: NOGEntity[];
}

export interface GeneratePatchRequest {
  /** Raw LLM response */
  llmResponse: string;

  /** Context for patch generation */
  context: PatchContext;
}

export interface GeneratePatchResponse {
  /** Generated NOG patches */
  patches: NOGPatch[];

  /** Confidence score (0-1) */
  confidence: number;

  /** Warnings or issues detected */
  warnings: string[];
}

// =============================================================================
// Full Pipeline Types
// =============================================================================

export interface AICompleteRequest {
  /** NOG graph */
  nogGraph: NOGGraph;

  /** User's request */
  userRequest: string;

  /** Optional panel ID to focus on */
  panelId?: string;
}

export interface AICompleteResponse {
  /** Generated patches ready to apply */
  patches: NOGPatch[];

  /** Raw LLM response */
  rawResponse: string;

  /** Context used for LLM */
  contextUsed: LLMContext;

  /** Confidence score */
  confidence: number;

  /** Any warnings */
  warnings: string[];
}

// =============================================================================
// LLM Client Types
// =============================================================================

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompleteOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMCompleteResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
