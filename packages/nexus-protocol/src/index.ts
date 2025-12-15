/**
 * @fileoverview Nexus Protocol - Core type definitions and validation
 * @module @nexus/protocol
 * @version 1.0.0
 * 
 * Nexus Protocol provides the foundational type system for the Nexus
 * AI-assisted prototyping platform. This package includes:
 * 
 * - **AST**: Abstract Syntax Tree definitions for NXML (Nexus Extensible Markup Language)
 * - **Schemas**: Zod validation schemas for runtime type checking
 * - **NOG**: Nexus Object Graph - the semantic truth layer for cross-panel synchronization
 * - **Utils**: Common utilities for working with Nexus types
 * 
 * @example
 * ```typescript
 * import { 
 *   NexusPanelAST, 
 *   createNexusPanelAST,
 *   validateNexusPanelAST 
 * } from '@nexus/protocol';
 * 
 * const panel = createNexusPanelAST({ title: 'My Panel' });
 * const result = validateNexusPanelAST(panel);
 * ```
 */

// =============================================================================
// AST Module
// =============================================================================

export * from './ast';

// =============================================================================
// Schemas Module
// =============================================================================

export * from './schemas';

// =============================================================================
// NOG Module (Nexus Object Graph)
// =============================================================================

export * from './nog';

// =============================================================================
// Utils Module
// =============================================================================

export * from './utils';

// =============================================================================
// Package Constants
// =============================================================================

/**
 * Protocol version
 */
export const NEXUS_PROTOCOL_VERSION = '1.0.0';

/**
 * NXML specification version
 */
export const NXML_SPEC_VERSION = '1.0.0';
