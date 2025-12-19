/**
 * MarketplaceBrowser - Browse and search marketplace panels
 *
 * Features:
 * - Search panels by name/description/tags
 * - Filter by category and type
 * - Sort by popularity, rating, recent
 * - Install panels directly
 * - View panel details
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, Star, Download, Tag } from 'lucide-react';
import { useMarketplacePanels, useCategories, usePanelInstallation } from '../marketplace/useMarketplace';
import { Panel, PanelFilters } from '../marketplace/MarketplaceClient';

export interface MarketplaceBrowserProps {
  /**
   * Callback when a panel is installed
   */
  onPanelInstalled?: (panel: Panel) => void;

  /**
   * Callback when a panel is clicked
   */
  onPanelClick?: (panel: Panel) => void;

  /**
   * Whether to show installed panels
   */
  showInstalledPanels?: boolean;

  /**
   * CSS class name
   */
  className?: string;
}

/**
 * Panel Card Component
 */
function PanelCard({
  panel,
  onInstall,
  onClick,
  isInstalling,
}: {
  panel: Panel;
  onInstall: () => void;
  onClick: () => void;
  isInstalling: boolean;
}) {
  const tags = panel.tags ? panel.tags.split(',').filter(Boolean) : [];

  return (
    <div
      className="rounded-xl bg-zinc-800/50 border border-white/5 p-4 hover:bg-zinc-800/70 transition-all cursor-pointer group"
      onClick={onClick}
    >
      {/* Header with icon and type badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={`w-12 h-12 rounded-lg bg-${panel.accentColor}-500/20 border border-${panel.accentColor}-500/30 flex items-center justify-center flex-shrink-0`}
          >
            <span className="text-2xl">{panel.icon}</span>
          </div>

          {/* Name and category */}
          <div>
            <h3 className="font-medium text-white group-hover:text-violet-400 transition-colors">
              {panel.name}
            </h3>
            <p className="text-xs text-zinc-500 capitalize">{panel.category}</p>
          </div>
        </div>

        {/* Type badge */}
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
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

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-md bg-zinc-900/50 text-xs text-zinc-500 flex items-center gap-1"
            >
              <Tag size={10} />
              {tag.trim()}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-zinc-600">+{tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Stats and install button */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
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

        {/* Install button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          disabled={isInstalling}
          className="px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isInstalling ? 'Installing...' : 'Install'}
        </button>
      </div>
    </div>
  );
}

/**
 * MarketplaceBrowser Component
 */
export function MarketplaceBrowser({
  onPanelInstalled,
  onPanelClick,
  showInstalledPanels = false,
  className = '',
}: MarketplaceBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'nexus' | 'free' | 'paid' | ''>('');
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'rating' | 'name'>('popular');
  const [installingPanelId, setInstallingPanelId] = useState<string | null>(null);

  // Build filters
  const filters: PanelFilters = useMemo(() => ({
    ...(searchQuery && { search: searchQuery }),
    ...(selectedCategory && { category: selectedCategory }),
    ...(selectedType && { type: selectedType }),
    sort: sortBy,
  }), [searchQuery, selectedCategory, selectedType, sortBy]);

  // Load panels and categories
  const { panels, count, isLoading, error, refresh } = useMarketplacePanels(filters);
  const { categories } = useCategories();

  // Handle panel installation
  const handleInstall = async (panel: Panel) => {
    setInstallingPanelId(panel.id);

    try {
      // This will be handled by the actual installation logic
      console.log('[MarketplaceBrowser] Installing panel:', panel.id);

      // Simulate installation (replace with actual logic in parent component)
      await new Promise(resolve => setTimeout(resolve, 500));

      onPanelInstalled?.(panel);
      await refresh(); // Refresh to update install counts
    } catch (err) {
      console.error('[MarketplaceBrowser] Failed to install panel:', err);
      alert('Failed to install panel. Please try again.');
    } finally {
      setInstallingPanelId(null);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header with search and filters */}
      <div className="flex-shrink-0 p-4 space-y-3 border-b border-white/10">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder="Search panels by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-zinc-500" />

          {/* Category filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
          >
            <option value="">All Types</option>
            <option value="nexus">Nexus Official</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/5 text-white text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
          >
            <option value="popular">Most Popular</option>
            <option value="recent">Most Recent</option>
            <option value="rating">Highest Rated</option>
            <option value="name">Name (A-Z)</option>
          </select>

          {/* Results count */}
          <span className="ml-auto text-sm text-zinc-500">
            {count} {count === 1 ? 'panel' : 'panels'}
          </span>
        </div>
      </div>

      {/* Panel grid */}
      <div className="flex-1 overflow-auto p-4">
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
        ) : panels.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-zinc-400 mb-2">No panels found</p>
              <p className="text-sm text-zinc-500">
                Try adjusting your search or filters
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {panels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                onInstall={() => handleInstall(panel)}
                onClick={() => onPanelClick?.(panel)}
                isInstalling={installingPanelId === panel.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
