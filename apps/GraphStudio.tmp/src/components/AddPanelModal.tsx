/**
 * AddPanelModal - Modal for adding panels to workspace
 *
 * Features:
 * - Two tabs: "My Panels" (installed) and "Marketplace" (browse)
 * - Install panels from marketplace
 * - Add installed panels to workspace
 * - Panel details view
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Package, ShoppingBag, Star, Download, ExternalLink } from 'lucide-react';
import { useMyPanels } from '../marketplace/useMarketplace';
import { Panel, Installation } from '../marketplace/MarketplaceClient';
import { MarketplaceBrowser } from './MarketplaceBrowser';
import useStudioStore from '../context/StudioContext';

export interface AddPanelModalProps {
  // No props needed - connects directly to StudioContext
}

type Tab = 'installed' | 'marketplace';

/**
 * Installed Panel Card
 */
function InstalledPanelCard({
  installation,
  onAdd,
}: {
  installation: Installation;
  onAdd: () => void;
}) {
  const panel = installation.panel;
  const tags = panel.tags ? panel.tags.split(',').filter(Boolean) : [];

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-white/5 p-4 hover:bg-zinc-800/70 transition-all group">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-lg bg-${panel.accentColor}-500/20 border border-${panel.accentColor}-500/30 flex items-center justify-center flex-shrink-0`}
        >
          <span className="text-2xl">{panel.icon}</span>
        </div>

        {/* Name and info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white group-hover:text-violet-400 transition-colors truncate">
            {panel.name}
          </h3>
          <p className="text-xs text-zinc-500 capitalize">{panel.category}</p>
          <p className="text-xs text-zinc-600 mt-1">v{installation.version}</p>
        </div>

        {/* Type badge */}
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
            panel.type === 'nexus'
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : panel.type === 'paid'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {panel.type}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{panel.description}</p>

      {/* Stats and add button */}
      <div className="flex items-center justify-between">
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Star size={12} className="text-amber-500" />
            {panel.averageRating?.toFixed(1) || 'N/A'}
          </span>
          <span className="flex items-center gap-1">
            <Download size={12} />
            {panel.installCount || 0}
          </span>
        </div>

        {/* Add button */}
        <button
          onClick={onAdd}
          className="px-4 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add to Workspace
        </button>
      </div>
    </div>
  );
}

/**
 * AddPanelModal Component
 */
export function AddPanelModal() {
  const {
    addPanelModalOpen,
    closeAddPanelModal,
    installPanel,
    addPanelToWorkspace,
    loadInstalledPanels,
  } = useStudioStore();

  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);

  // Load installed panels
  const { installations, isLoading, error, refresh } = useMyPanels();

  // Load installed panels on mount
  useEffect(() => {
    if (addPanelModalOpen) {
      loadInstalledPanels();
      refresh();
    }
  }, [addPanelModalOpen, loadInstalledPanels, refresh]);

  // Handle panel installation from marketplace
  const handleMarketplaceInstall = async (panel: Panel) => {
    try {
      await installPanel(panel.id);
      await refresh(); // Refresh installed panels
      // Switch to installed tab to show the newly installed panel
      setActiveTab('installed');
    } catch (err) {
      console.error('[AddPanelModal] Failed to install panel:', err);
      alert('Failed to install panel. Please try again.');
    }
  };

  // Handle adding panel to workspace
  const handleAddToWorkspace = async (panel: Panel) => {
    try {
      await addPanelToWorkspace(panel.id);
      closeAddPanelModal();
    } catch (err) {
      console.error('[AddPanelModal] Failed to add panel to workspace:', err);
      alert('Failed to add panel to workspace. Please try again.');
    }
  };

  if (!addPanelModalOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={closeAddPanelModal}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Add Panel</h2>
            <button
              onClick={closeAddPanelModal}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 px-6 py-3 border-b border-white/10">
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                activeTab === 'installed'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Package size={16} />
              My Panels ({installations.length})
            </button>
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                activeTab === 'marketplace'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShoppingBag size={16} />
              Marketplace
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'installed' ? (
              <div className="h-full overflow-auto p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4" />
                      <p className="text-sm text-zinc-400">Loading panels...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-red-400 mb-2">Failed to load panels</p>
                      <p className="text-sm text-zinc-500">{error.message}</p>
                      <button
                        onClick={refresh}
                        className="mt-4 px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                ) : installations.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Package size={48} className="text-zinc-700 mx-auto mb-4" />
                      <p className="text-zinc-400 mb-2">No panels installed yet</p>
                      <p className="text-sm text-zinc-500 mb-4">
                        Browse the marketplace to install panels
                      </p>
                      <button
                        onClick={() => setActiveTab('marketplace')}
                        className="px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-colors inline-flex items-center gap-2"
                      >
                        <ShoppingBag size={16} />
                        Go to Marketplace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {installations.map((installation) => (
                      <InstalledPanelCard
                        key={installation.id}
                        installation={installation}
                        onAdd={() => handleAddToWorkspace(installation.panel)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <MarketplaceBrowser
                onPanelInstalled={handleMarketplaceInstall}
                onPanelClick={setSelectedPanel}
              />
            )}
          </div>

          {/* Footer with help text */}
          <div className="px-6 py-3 border-t border-white/10 text-xs text-zinc-500">
            <p>
              💡 Tip: Install panels from the marketplace, then add them to your workspace
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default AddPanelModal;
