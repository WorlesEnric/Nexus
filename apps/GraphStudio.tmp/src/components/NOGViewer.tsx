/**
 * NOGViewer - Nexus Object Graph Viewer
 *
 * Visualizes the NOG (Nexus Object Graph) maintained by workspace-kernel
 *
 * Features:
 * - Entity list with filtering by panel/category
 * - Entity details inspector
 * - Relationship visualization
 * - Real-time updates via WebSocket
 * - Search and filter capabilities
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNOGGraph } from '../context/NexusContext';
import useStudioStore from '../context/StudioContext';
import { motion } from 'framer-motion';
import {
  Network,
  Search,
  Filter,
  Box,
  Tag,
  Link as LinkIcon,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
  X,
} from 'lucide-react';

// Import generated types from nexus-protocol
// Backend now uses camelCase serialization via Pydantic alias_generator
export interface NOGEntity {
  id: string;
  entityType: string;  // From Python: entity_type
  name: string;
  description?: string | null;
  properties: Record<string, any>;
  sourcePanelId?: string | null;  // From Python: source_panel_id
  sourceLocation?: string | null;
  version: number;
  createdAt: string;  // ISO timestamp from Python datetime
  updatedAt: string;
  tags: string[];
}

export interface NOGRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;  // From Python: relation_type
  properties?: Record<string, any>;
  weight?: number;
  bidirectional?: boolean;
  createdAt: string;
  createdBy?: string | null;
}

export interface NOGGraphSnapshot {
  workspaceId: string;
  workspaceName: string;
  version: number;
  entities: NOGEntity[];
  relationships: NOGRelationship[];
  entityCount: number;
  relationshipCount: number;
  entityTypes: Record<string, number>;
  createdAt: string;
  commitHash?: string | null;
}

export interface NOGViewerProps {
  // No props needed - modal controlled by StudioContext
}

/**
 * Entity Card Component
 */
function EntityCard({
  entity,
  isSelected,
  onClick,
}: {
  entity: NOGEntity;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-3 cursor-pointer transition-all ${
        isSelected
          ? 'bg-violet-500/20 border-2 border-violet-500/50'
          : 'bg-zinc-800/50 border border-white/5 hover:bg-zinc-800/70'
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <Box size={16} className="text-violet-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{entity.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500 capitalize">{entity.entityType}</span>
            <span className="text-xs text-zinc-600">•</span>
            <span className="text-xs text-zinc-500">{entity.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {entity.sourcePanelId && (
        <div className="flex items-center gap-1 text-xs text-zinc-600">
          <Tag size={10} />
          <span className="truncate">{entity.sourcePanelId.slice(0, 12)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Entity Inspector Component
 */
function EntityInspector({
  entity,
  relationships,
  allEntities,
}: {
  entity: NOGEntity;
  relationships: NOGRelationship[];
  allEntities: NOGEntity[];
}) {
  // Find related entities
  const relatedTo = useMemo(() => {
    return relationships
      .filter((r) => r.sourceId === entity.id)
      .map((r) => ({
        relationship: r,
        entity: allEntities.find((e) => e.id === r.targetId),
      }))
      .filter((item) => item.entity);
  }, [entity, relationships, allEntities]);

  const relatedFrom = useMemo(() => {
    return relationships
      .filter((r) => r.targetId === entity.id)
      .map((r) => ({
        relationship: r,
        entity: allEntities.find((e) => e.id === r.sourceId),
      }))
      .filter((item) => item.entity);
  }, [entity, relationships, allEntities]);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Box size={20} className="text-violet-400" />
          <h3 className="text-lg font-semibold text-white">{entity.name}</h3>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 capitalize">
            {entity.category}
          </span>
          <span className="text-zinc-500">{entity.id}</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
        <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Metadata</h4>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Entity Type:</span>
            <span className="text-white capitalize">{entity.entityType}</span>
          </div>
          {entity.sourcePanelId && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Source Panel:</span>
              <span className="text-white font-mono">{entity.sourcePanelId.slice(0, 16)}...</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Version:</span>
            <span className="text-white">{entity.version}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Created:</span>
            <span className="text-white">{new Date(entity.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Updated:</span>
            <span className="text-white">{new Date(entity.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
        <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Properties</h4>
        <pre className="text-xs text-zinc-300 overflow-auto max-h-48 bg-black/20 rounded p-2">
          {JSON.stringify(entity.properties, null, 2)}
        </pre>
      </div>

      {/* Tags */}
      {entity.tags && entity.tags.length > 0 && (
        <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {entity.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      {(relatedTo.length > 0 || relatedFrom.length > 0) && (
        <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-3">Relationships</h4>

          {/* Outgoing relationships */}
          {relatedTo.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon size={12} className="text-emerald-400" />
                <span className="text-xs text-zinc-500">References ({relatedTo.length})</span>
              </div>
              <div className="space-y-1">
                {relatedTo.map(({ relationship, entity: target }) => (
                  <div
                    key={relationship.id}
                    className="text-xs p-2 rounded bg-black/20 border border-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-violet-400">{relationship.relationType}</span>
                      <span className="text-zinc-600">→</span>
                    </div>
                    <span className="text-zinc-400">{target?.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incoming relationships */}
          {relatedFrom.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon size={12} className="text-amber-400" />
                <span className="text-xs text-zinc-500">Referenced By ({relatedFrom.length})</span>
              </div>
              <div className="space-y-1">
                {relatedFrom.map(({ relationship, entity: source }) => (
                  <div
                    key={relationship.id}
                    className="text-xs p-2 rounded bg-black/20 border border-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">{source?.name}</span>
                      <span className="text-zinc-600">→</span>
                    </div>
                    <span className="text-amber-400">{relationship.relationType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * NOG Viewer Component
 */
export function NOGViewer() {
  const { closeNOGViewer } = useStudioStore();
  const { graph, isLoading, error, refresh } = useNOGGraph();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterPanel, setFilterPanel] = useState<string>('');
  const [showRelationships, setShowRelationships] = useState(true);

  // Extract entity types and panels
  const entityTypes = useMemo(() => {
    if (!graph) return [];
    const types = new Set(graph.entities.map((e) => e.entityType));
    return Array.from(types).sort();
  }, [graph]);

  const panels = useMemo(() => {
    if (!graph) return [];
    const pnls = new Set(
      graph.entities
        .map((e) => e.sourcePanelId)
        .filter((id): id is string => id !== null && id !== undefined)
    );
    return Array.from(pnls).sort();
  }, [graph]);

  // Filter entities
  const filteredEntities = useMemo(() => {
    if (!graph) return [];

    return graph.entities.filter((entity) => {
      // Search filter
      if (
        searchQuery &&
        !entity.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !entity.id.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Entity type filter
      if (filterCategory && entity.entityType !== filterCategory) {
        return false;
      }

      // Panel filter
      if (filterPanel && entity.sourcePanelId !== filterPanel) {
        return false;
      }

      return true;
    });
  }, [graph, searchQuery, filterCategory, filterPanel]);

  // Selected entity
  const selectedEntity = useMemo(() => {
    if (!graph || !selectedEntityId) return null;
    return graph.entities.find((e) => e.id === selectedEntityId) || null;
  }, [graph, selectedEntityId]);

  // Auto-select first entity
  useEffect(() => {
    if (filteredEntities.length > 0 && !selectedEntityId) {
      setSelectedEntityId(filteredEntities[0].id);
    }
  }, [filteredEntities, selectedEntityId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeNOGViewer}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-6xl h-[80vh] flex flex-col bg-zinc-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Network size={20} className="text-violet-400" />
            <h2 className="text-lg font-semibold text-white">NOG Viewer</h2>
            {graph && (
              <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs font-medium">
                v{graph.version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={closeNOGViewer}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b border-white/10 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-zinc-500" />

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-xs focus:outline-none focus:border-violet-500/50"
          >
            <option value="">All Entity Types</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={filterPanel}
            onChange={(e) => setFilterPanel(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-xs focus:outline-none focus:border-violet-500/50"
          >
            <option value="">All Panels</option>
            {panels.map((panel) => (
              <option key={panel} value={panel}>
                {panel.slice(0, 16)}...
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowRelationships(!showRelationships)}
            className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              showRelationships
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-white/5'
            }`}
          >
            {showRelationships ? <Eye size={12} /> : <EyeOff size={12} />}
            Relationships
          </button>

          <span className="text-xs text-zinc-500">
            {filteredEntities.length} {filteredEntities.length === 1 ? 'entity' : 'entities'}
          </span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4" />
            <p className="text-sm text-zinc-400">Loading NOG graph...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load NOG graph</p>
            <p className="text-sm text-zinc-500 mb-4">{error.message}</p>
            <button
              onClick={refresh}
              className="px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !graph || filteredEntities.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Layers size={48} className="text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 mb-2">No entities found</p>
            <p className="text-sm text-zinc-500">
              {searchQuery || filterCategory || filterPanel
                ? 'Try adjusting your filters'
                : 'The NOG graph is empty'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Entity list */}
          <div className="w-80 border-r border-white/10 overflow-auto p-4 space-y-2">
            {filteredEntities.map((entity) => (
              <EntityCard
                key={entity.id}
                entity={entity}
                isSelected={selectedEntityId === entity.id}
                onClick={() => setSelectedEntityId(entity.id)}
              />
            ))}
          </div>

          {/* Entity inspector */}
          <div className="flex-1 overflow-hidden">
            {selectedEntity ? (
              <EntityInspector
                entity={selectedEntity}
                relationships={showRelationships ? graph.relationships : []}
                allEntities={graph.entities}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-zinc-500 text-sm">Select an entity to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
      </motion.div>
    </div>
  );
}

export default NOGViewer;
