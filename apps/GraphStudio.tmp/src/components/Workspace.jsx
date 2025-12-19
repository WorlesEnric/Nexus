import React from 'react';
import { Plus } from 'lucide-react';
import useStudioStore from '../context/StudioContext';
import PanelContainer from './PanelContainer';
import EmptyWorkspaceState from './EmptyWorkspaceState';

/**
 * Workspace - The main area where panels are displayed
 * 
 * Handles:
 * - Panel layout (flexible, fullscreen, minimized)
 * - Empty state
 * - Panel transitions
 */
export default function Workspace() {
  const {
    panels,
    activeFullscreenId,
    focusedPanelId,
    openAddPanelModal
  } = useStudioStore();

  // Get visible panels (not hidden)
  const visiblePanels = panels.filter(p => p.mode !== 'hidden');

  // Check if we have any panels at all
  const hasNoPanels = panels.length === 0;
  const hasNoVisiblePanels = visiblePanels.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Workspace Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-white/5 bg-black/20 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-zinc-300">Workspace</h1>
          <span className="text-xs text-zinc-600">
            {visiblePanels.length} panel{visiblePanels.length !== 1 ? 's' : ''} active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick add button */}
          <button
            onClick={openAddPanelModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Plus size={14} />
            Add Panel
          </button>
        </div>
      </div>

      {/* Main workspace area */}
      <div className="flex-1 overflow-hidden p-4">
        {hasNoPanels || hasNoVisiblePanels ? (
          /* Empty State */
          <EmptyWorkspaceState onAddPanel={openAddPanelModal} />
        ) : (
          /* Panels Grid */
          <div className="h-full flex gap-4 overflow-hidden">
            {visiblePanels.map((panel) => {
              // If another panel is fullscreen, hide this one
              if (activeFullscreenId && activeFullscreenId !== panel.id) {
                return null;
              }

              // Determine panel width based on mode
              let widthClass = '';
              if (panel.mode === 'fullscreen') {
                widthClass = 'w-full';
              } else if (panel.mode === 'minimized') {
                widthClass = 'w-16';
              } else {
                // Flexible mode - share space
                widthClass = 'flex-1 min-w-[300px] max-w-none';
              }

              return (
                <PanelContainer
                  key={panel.id}
                  panel={panel}
                  widthClass={widthClass}
                  isFocused={focusedPanelId === panel.id}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}