import React, { useEffect } from 'react';
import useStudioStore, { useKeyboardShortcuts } from '../context/StudioContext';
import { useWorkspace } from '../context/WorkspaceContext';
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import WorkspaceLauncher from './WorkspaceLauncher';
import CommandPalette from './CommandPalette';
import AddPanelModal from './AddPanelModal';
import SettingsModal from './SettingsModal';
import HelpModal from './HelpModal';
import NOGViewer from './NOGViewer';
import { PublishPanelModal } from './PublishPanelModal';

import Background from './Background';

/**
 * Shell - The main container/commander for the entire IDE
 * 
 * Responsibilities:
 * - Layout management
 * - Keyboard shortcuts
 * - Global modals (command palette, add panel)
 * - Cross-panel coordination
 * */
export default function Shell() {
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  const { currentWorkspace } = useWorkspace();

  const {
    commandPaletteOpen,
    addPanelModalOpen,
    settingsModalOpen,
    helpModalOpen,
    nogViewerOpen,
    publishPanelModalOpen,
    loadAvailablePanels,
    loadInstalledPanels,
  } = useStudioStore();

  // Initialize marketplace on mount
  useEffect(() => {
    loadAvailablePanels();
    loadInstalledPanels();
  }, [loadAvailablePanels, loadInstalledPanels]);

  // If no workspace is open, show the workspace launcher
  if (!currentWorkspace) {
    return <WorkspaceLauncher />;
  }

  // Otherwise, show the normal workspace UI
  return (
    <div className="flex h-screen w-full bg-primary text-text-primary overflow-hidden relative">
      <Background />

      {/* Main layout */}
      <div className="relative flex w-full z-10">
        {/* Left Sidebar (The Dock) */}
        <Sidebar />

        {/* Main Workspace */}
        <Workspace />
      </div>

      {/* Command Palette Modal */}
      {commandPaletteOpen && <CommandPalette />}

      {/* Add Panel Modal */}
      {addPanelModalOpen && <AddPanelModal />}

      {/* Settings Modal */}
      {settingsModalOpen && <SettingsModal />}

      {/* Help Modal */}
      {helpModalOpen && <HelpModal />}

      {/* NOG Viewer */}
      {nogViewerOpen && <NOGViewer />}

      {/* Publish Panel Modal */}
      {publishPanelModalOpen && (
        <PublishPanelModal
          isOpen={publishPanelModalOpen}
          onClose={() => useStudioStore.getState().closePublishPanelModal()}
          onPublished={(panelId) => {
            console.log('[Shell] Panel published:', panelId);
            useStudioStore.getState().closePublishPanelModal();
            useStudioStore.getState().loadAvailablePanels();
          }}
        />
      )}

      {/* Keyboard shortcut hints */}
      <div className="fixed bottom-4 right-4 flex items-center gap-3 text-xs text-zinc-600 pointer-events-none z-50">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 font-mono">⌘K</kbd>
          Command
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 font-mono">⌘N</kbd>
          New Panel
        </span>
      </div>
    </div>
  );
}