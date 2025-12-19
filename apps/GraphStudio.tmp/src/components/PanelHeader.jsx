import React, { useState } from 'react';
import {
  Maximize2,
  Minimize2,
  X,
  Eye,
  EyeOff,
  MoreHorizontal,
  Sparkles,
  Download,
  Copy,
  Settings,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import useStudioStore from '../context/StudioContext';
import { PatchReviewModal } from './PatchReviewModal';

/**
 * PanelHeader - Header bar for panel with title, controls, and actions
 */
export default function PanelHeader({ panel, panelDef, isFocused }) {
  const {
    updatePanelMode,
    updatePanelTitle,
    removePanel,
    setAIObserving
  } = useStudioStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(panel.title);
  const [showMenu, setShowMenu] = useState(false);
  const [showPatchReview, setShowPatchReview] = useState(false);

  // No accent color logic needed for monochrome

  const handleTitleSubmit = () => {
    if (editTitle.trim()) {
      updatePanelTitle(panel.id, editTitle.trim());
    } else {
      setEditTitle(panel.title);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(panel.title);
      setIsEditing(false);
    }
  };

  const toggleMode = () => {
    if (panel.mode === 'fullscreen') {
      updatePanelMode(panel.id, 'flexible');
    } else {
      updatePanelMode(panel.id, 'fullscreen');
    }
  };

  const minimizePanel = () => {
    updatePanelMode(panel.id, 'minimized');
  };

  const hidePanel = () => {
    updatePanelMode(panel.id, 'hidden');
  };

  const toggleAIObserving = () => {
    setAIObserving(panel.id, !panel.isAIObserving);
  };

  const handleSync = async () => {
    // TODO: Call workspace-kernel API to generate patches for this panel
    // For now, just open the PatchReviewModal
    setShowPatchReview(true);
  };

  return (
    <div className={`
      flex items-center gap-2 px-4 py-3 
      border-b transition-colors
      ${isFocused ? 'border-white/10 bg-white/5' : 'border-white/5'}
    `}>
      {/* Panel Icon */}
      <div className="p-1.5 rounded-lg text-zinc-400 bg-white/5">
        <panelDef.icon size={14} />
      </div>

      {/* Title */}
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleTitleSubmit}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm font-medium text-white bg-transparent border-b border-white/30 focus:border-violet-500 outline-none px-1"
          autoFocus
        />
      ) : (
        <h3
          className="flex-1 text-sm font-medium text-zinc-200 truncate cursor-pointer hover:text-white transition-colors"
          onDoubleClick={() => setIsEditing(true)}
          title="Double-click to rename"
        >
          {panel.title}
        </h3>
      )}

      {/* AI Observing indicator */}
      {panel.isAIObserving && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 border border-white/20">
          <Sparkles size={12} className="text-white" />
          <span className="text-xs text-white">AI Active</span>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center gap-1">
        {/* Sync/Patches button - only show for marketplace panels */}
        {panel._marketplace && (
          <button
            onClick={handleSync}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
            title="Review NOG patches"
          >
            <RefreshCw size={14} />
          </button>
        )}

        {/* AI Toggle */}
        <button
          onClick={toggleAIObserving}
          className={`
            p-1.5 rounded-lg transition-all
            ${panel.isAIObserving
              ? 'text-white bg-white/10 hover:bg-white/20'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }
          `}
          title={panel.isAIObserving ? 'Disable AI observation' : 'Enable AI observation'}
        >
          {panel.isAIObserving ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        {/* Minimize */}
        <button
          onClick={minimizePanel}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
          title="Minimize"
        >
          <Minimize2 size={14} />
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleMode}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
          title={panel.mode === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <Maximize2 size={14} />
        </button>

        {/* More menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />

              {/* Menu */}
              <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-xl bg-zinc-800/95 backdrop-blur border border-white/10 shadow-xl z-50 animate-scale-in">
                <button
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Settings size={14} />
                  Rename Panel
                </button>

                <button
                  onClick={() => { toggleAIObserving(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Sparkles size={14} />
                  {panel.isAIObserving ? 'Disable' : 'Enable'} AI Context
                </button>

                {panelDef.exportFormats?.length > 0 && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Download size={14} />
                    Export
                    <ChevronDown size={12} className="ml-auto" />
                  </button>
                )}

                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Copy size={14} />
                  Duplicate Panel
                </button>

                <div className="my-1 border-t border-white/10" />

                <button
                  onClick={() => { hidePanel(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <EyeOff size={14} />
                  Hide Panel
                </button>

                <button
                  onClick={() => { removePanel(panel.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  <X size={14} />
                  Remove Panel
                </button>
              </div>
            </>
          )}
        </div>

        {/* Close */}
        <button
          onClick={hidePanel}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          title="Hide panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Patch Review Modal */}
      <PatchReviewModal
        isOpen={showPatchReview}
        onClose={() => setShowPatchReview(false)}
        onPatchesUpdated={() => {
          // Refresh panel state or NOG graph if needed
          console.log('[PanelHeader] Patches updated');
        }}
      />
    </div>
  );
}