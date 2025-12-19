/**
 * PatchReviewModal - Review and approve/reject NOG patches
 *
 * NOG patches represent proposed changes to the Nexus Object Graph
 * resulting from cross-panel interactions and state synchronization.
 *
 * Features:
 * - View pending patches
 * - Inspect patch details and diffs
 * - Approve or reject patches
 * - Batch operations
 * - History view
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, XCircle, AlertCircle, Clock, CheckCircle, GitBranch, Eye } from 'lucide-react';
import { useNexusClient } from '../context/NexusContext';

export interface NOGPatch {
  id: string;
  operation: string;
  sourcePanel: string;
  targetPanel?: string;
  status: 'pending' | 'approved' | 'rejected';
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: string;
  appliedAt?: string;
}

export interface PatchReviewModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Callback when patches are updated
   */
  onPatchesUpdated?: () => void;
}

/**
 * Patch Status Badge
 */
function StatusBadge({ status }: { status: NOGPatch['status'] }) {
  const config = {
    pending: {
      icon: Clock,
      className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      label: 'Pending',
    },
    approved: {
      icon: CheckCircle,
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      label: 'Approved',
    },
    rejected: {
      icon: XCircle,
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
      label: 'Rejected',
    },
  };

  const { icon: Icon, className, label } = config[status];

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border flex items-center gap-1 ${className}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

/**
 * Patch Card Component
 */
function PatchCard({
  patch,
  isSelected,
  onClick,
}: {
  patch: NOGPatch;
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
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-violet-400 flex-shrink-0" />
          <span className="text-sm font-medium text-white capitalize">{patch.operation}</span>
        </div>
        <StatusBadge status={patch.status} />
      </div>

      {/* Flow */}
      <div className="text-xs text-zinc-400 mb-2">
        <span className="font-mono">{patch.sourcePanel.slice(0, 12)}</span>
        {patch.targetPanel && (
          <>
            <span className="mx-1">→</span>
            <span className="font-mono">{patch.targetPanel.slice(0, 12)}</span>
          </>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-xs text-zinc-600">
        {new Date(patch.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

/**
 * Patch Details Component
 */
function PatchDetails({ patch }: { patch: NOGPatch }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <GitBranch size={20} className="text-violet-400" />
          <h3 className="text-lg font-semibold text-white capitalize">{patch.operation}</h3>
          <StatusBadge status={patch.status} />
        </div>

        <div className="text-sm text-zinc-400">
          Patch ID: <span className="font-mono text-zinc-500">{patch.id}</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
        <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Details</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Operation:</span>
            <span className="text-white capitalize">{patch.operation}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Source Panel:</span>
            <span className="text-white font-mono">{patch.sourcePanel.slice(0, 20)}...</span>
          </div>
          {patch.targetPanel && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Target Panel:</span>
              <span className="text-white font-mono">{patch.targetPanel.slice(0, 20)}...</span>
            </div>
          )}
          {patch.entityId && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Entity ID:</span>
              <span className="text-white font-mono">{patch.entityId.slice(0, 20)}...</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Created:</span>
            <span className="text-white">{new Date(patch.createdAt).toLocaleString()}</span>
          </div>
          {patch.appliedAt && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Applied:</span>
              <span className="text-white">{new Date(patch.appliedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Changes */}
      {patch.changes && (
        <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Changes</h4>
          <pre className="text-xs text-zinc-300 overflow-auto max-h-64 bg-black/20 rounded p-2">
            {JSON.stringify(patch.changes, null, 2)}
          </pre>
        </div>
      )}

      {/* Metadata */}
      {patch.metadata && (
        <div className="rounded-lg bg-zinc-900/50 border border-white/5 p-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Metadata</h4>
          <pre className="text-xs text-zinc-300 overflow-auto max-h-48 bg-black/20 rounded p-2">
            {JSON.stringify(patch.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Warning for pending patches */}
      {patch.status === 'pending' && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300">
            <p className="font-medium mb-1">Review Required</p>
            <p className="text-amber-400/80">
              This patch will modify the NOG graph. Review the changes carefully before approving.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PatchReviewModal Component
 */
export function PatchReviewModal({ isOpen, onClose, onPatchesUpdated }: PatchReviewModalProps) {
  const client = useNexusClient();
  const [patches, setPatches] = useState<NOGPatch[]>([]);
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Load patches
  const loadPatches = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual API call to get patches
      // const response = await fetch(`http://localhost:3000/state/patches?status=${filterStatus === 'all' ? '' : filterStatus}`);
      // const data = await response.json();
      // setPatches(data.patches || []);

      // Mock data for now
      const mockPatches: NOGPatch[] = [
        {
          id: 'patch-1',
          operation: 'create_entity',
          sourcePanel: 'panel-notes-123',
          targetPanel: 'panel-chat-456',
          status: 'pending',
          entityId: 'entity-789',
          changes: {
            name: 'New Note',
            content: 'This is a note created from Notes panel',
            category: 'note',
          },
          createdAt: new Date().toISOString(),
        },
        {
          id: 'patch-2',
          operation: 'update_entity',
          sourcePanel: 'panel-chat-456',
          status: 'pending',
          entityId: 'entity-111',
          changes: {
            messages: ['Updated chat message'],
          },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'patch-3',
          operation: 'delete_entity',
          sourcePanel: 'panel-notes-123',
          status: 'approved',
          entityId: 'entity-222',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          appliedAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      setPatches(filterStatus === 'all' ? mockPatches : mockPatches.filter(p => p.status === filterStatus));
    } catch (err) {
      console.error('[PatchReviewModal] Failed to load patches:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPatches();
    }
  }, [isOpen, filterStatus]);

  // Filter patches
  const filteredPatches = useMemo(() => {
    return filterStatus === 'all' ? patches : patches.filter((p) => p.status === filterStatus);
  }, [patches, filterStatus]);

  // Selected patch
  const selectedPatch = useMemo(() => {
    if (!selectedPatchId) return null;
    return patches.find((p) => p.id === selectedPatchId) || null;
  }, [patches, selectedPatchId]);

  // Auto-select first patch
  useEffect(() => {
    if (filteredPatches.length > 0 && !selectedPatchId) {
      setSelectedPatchId(filteredPatches[0].id);
    }
  }, [filteredPatches, selectedPatchId]);

  // Apply patch (approve or reject)
  const applyPatch = async (patchId: string, action: 'approve' | 'reject') => {
    setIsApplying(true);

    try {
      const patch = patches.find((p) => p.id === patchId);
      if (!patch) throw new Error('Patch not found');

      // Apply via workspace-kernel
      await client.applyPatches([{ ...patch, status: action === 'approve' ? 'approved' : 'rejected' }]);

      // Update local state
      setPatches((prev) =>
        prev.map((p) => (p.id === patchId ? { ...p, status: action === 'approve' ? 'approved' : 'rejected', appliedAt: new Date().toISOString() } : p))
      );

      // Notify parent
      onPatchesUpdated?.();

      // If this was the selected patch and no more pending, clear selection
      if (selectedPatchId === patchId) {
        const remainingPending = patches.filter((p) => p.status === 'pending' && p.id !== patchId);
        if (remainingPending.length > 0) {
          setSelectedPatchId(remainingPending[0].id);
        } else {
          setSelectedPatchId(null);
        }
      }
    } catch (err) {
      console.error('[PatchReviewModal] Failed to apply patch:', err);
      alert(`Failed to ${action} patch: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <GitBranch size={20} className="text-violet-400" />
              <h2 className="text-xl font-semibold text-white">Review NOG Patches</h2>
              {patches.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs font-medium">
                  {filteredPatches.length} {filteredPatches.length === 1 ? 'patch' : 'patches'}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Filter */}
          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Filter:</span>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  filterStatus === status
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4" />
                  <p className="text-sm text-zinc-400">Loading patches...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-red-400 mb-2">Failed to load patches</p>
                  <p className="text-sm text-zinc-500 mb-4">{error.message}</p>
                  <button
                    onClick={loadPatches}
                    className="px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : filteredPatches.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Eye size={48} className="text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400 mb-2">No patches found</p>
                  <p className="text-sm text-zinc-500">
                    {filterStatus === 'pending'
                      ? 'All patches have been reviewed'
                      : `No ${filterStatus} patches`}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Patch list */}
                <div className="w-80 border-r border-white/10 overflow-auto p-4 space-y-2">
                  {filteredPatches.map((patch) => (
                    <PatchCard
                      key={patch.id}
                      patch={patch}
                      isSelected={selectedPatchId === patch.id}
                      onClick={() => setSelectedPatchId(patch.id)}
                    />
                  ))}
                </div>

                {/* Patch details */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {selectedPatch ? (
                    <>
                      <div className="flex-1 overflow-auto p-6">
                        <PatchDetails patch={selectedPatch} />
                      </div>

                      {/* Actions */}
                      {selectedPatch.status === 'pending' && (
                        <div className="border-t border-white/10 p-4 flex items-center justify-end gap-3">
                          <button
                            onClick={() => applyPatch(selectedPatch.id, 'reject')}
                            disabled={isApplying}
                            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            <XCircle size={16} />
                            Reject
                          </button>
                          <button
                            onClick={() => applyPatch(selectedPatch.id, 'approve')}
                            disabled={isApplying}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            <Check size={16} />
                            Approve & Apply
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-zinc-500 text-sm">Select a patch to view details</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
