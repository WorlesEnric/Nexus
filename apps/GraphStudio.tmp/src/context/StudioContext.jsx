import React from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getMarketplaceClient } from '../marketplace/MarketplaceClient';
import { getNexusClient } from '../api/NexusClient';

/**
 * Panel Mode Types:
 * - 'hidden': Panel is in sidebar only, not visible in workspace
 * - 'minimized': Panel is a thin vertical bar in workspace
 * - 'flexible': Panel takes shared space in workspace
 * - 'fullscreen': Panel takes entire workspace
 */

/**
 * @typedef {'hidden' | 'minimized' | 'flexible' | 'fullscreen'} PanelMode
 * 
 * @typedef {Object} PanelInstance
 * @property {string} id - Unique identifier
 * @property {string} panelTypeId - Reference to panel type in registry
 * @property {string} title - Display title
 * @property {PanelMode} mode - Current display mode
 * @property {Object} state - Panel-specific state data
 * @property {number} order - Display order in workspace
 * @property {boolean} isAIObserving - Whether AI is reading this panel's context
 */

const useStudioStore = create(
  subscribeWithSelector((set, get) => ({
    // === Panel Instances State ===
    panels: [],

    // === UI State ===
    activeFullscreenId: null,
    focusedPanelId: null,
    commandPaletteOpen: false,
    addPanelModalOpen: false,
    settingsModalOpen: false,
    helpModalOpen: false,
    nogViewerOpen: false,
    publishPanelModalOpen: false,

    // === Settings State ===
    theme: 'dark', // 'dark' | 'light'
    shortcuts: {
      commandPalette: 'k',
      newItem: 'n'
    },

    // === Drag & Drop State ===
    dragSource: null,
    dragData: null,
    dropTarget: null,

    // === AI State ===
    aiObservingPanels: [],
    globalContext: {},

    // === Marketplace State ===
    availablePanels: [],
    installedPanels: [],
    isLoadingPanels: false,
    panelsError: null,

    // === Panel Actions ===
    addPanel: (panelTypeId, initialState = {}) => {
      const id = `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const panels = get().panels;

      set({
        panels: [
          ...panels,
          {
            id,
            panelTypeId,
            title: initialState.title || panelTypeId,
            mode: 'flexible',
            state: initialState,
            order: panels.length,
            isAIObserving: false,
          }
        ]
      });

      return id;
    },

    removePanel: (id) => {
      set((state) => ({
        panels: state.panels.filter(p => p.id !== id),
        focusedPanelId: state.focusedPanelId === id ? null : state.focusedPanelId,
        activeFullscreenId: state.activeFullscreenId === id ? null : state.activeFullscreenId,
      }));
    },

    updatePanelMode: (id, mode) => {
      set((state) => {
        let newActiveFullscreen = state.activeFullscreenId;

        // Handle fullscreen logic
        if (mode === 'fullscreen') {
          newActiveFullscreen = id;
        } else if (state.activeFullscreenId === id) {
          newActiveFullscreen = null;
        }

        return {
          panels: state.panels.map(p =>
            p.id === id ? { ...p, mode } : p
          ),
          activeFullscreenId: newActiveFullscreen,
        };
      });
    },

    updatePanelState: (id, newState) => {
      set((state) => ({
        panels: state.panels.map(p =>
          p.id === id ? { ...p, state: { ...p.state, ...newState } } : p
        )
      }));
    },

    updatePanelTitle: (id, title) => {
      set((state) => ({
        panels: state.panels.map(p =>
          p.id === id ? { ...p, title } : p
        )
      }));
    },

    updatePanelId: (oldId, newId) => {
      set((state) => ({
        panels: state.panels.map(p =>
          p.id === oldId ? { ...p, id: newId } : p
        ),
        focusedPanelId: state.focusedPanelId === oldId ? newId : state.focusedPanelId,
        activeFullscreenId: state.activeFullscreenId === oldId ? newId : state.activeFullscreenId,
      }));
    },

    reorderPanels: (sourceId, targetId) => {
      set((state) => {
        const panels = [...state.panels];
        const sourceIndex = panels.findIndex(p => p.id === sourceId);
        const targetIndex = panels.findIndex(p => p.id === targetId);

        if (sourceIndex === -1 || targetIndex === -1) return state;

        const [removed] = panels.splice(sourceIndex, 1);
        panels.splice(targetIndex, 0, removed);

        return { panels: panels.map((p, i) => ({ ...p, order: i })) };
      });
    },

    // === Focus Actions ===
    setFocusedPanel: (id) => {
      set({ focusedPanelId: id });
    },

    // === Command Palette Actions ===
    toggleCommandPalette: () => {
      set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
    },

    openCommandPalette: () => set({ commandPaletteOpen: true }),
    closeCommandPalette: () => set({ commandPaletteOpen: false }),

    // === Add Panel Modal Actions ===
    openAddPanelModal: () => set({ addPanelModalOpen: true }),
    closeAddPanelModal: () => set({ addPanelModalOpen: false }),

    // === Settings & Help Actions ===
    openSettingsModal: () => set({ settingsModalOpen: true }),
    closeSettingsModal: () => set({ settingsModalOpen: false }),
    openHelpModal: () => set({ helpModalOpen: true }),
    closeHelpModal: () => set({ helpModalOpen: false }),

    // === NOG Viewer Actions ===
    openNOGViewer: () => set({ nogViewerOpen: true }),
    closeNOGViewer: () => set({ nogViewerOpen: false }),

    // === Publish Panel Modal Actions ===
    openPublishPanelModal: () => set({ publishPanelModalOpen: true }),
    closePublishPanelModal: () => set({ publishPanelModalOpen: false }),

    setTheme: (theme) => {
      set({ theme });
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },

    updateShortcuts: (action, key) => set(state => ({
      shortcuts: { ...state.shortcuts, [action]: key }
    })),

    // === Drag & Drop Actions ===
    startDrag: (sourceId, data) => {
      set({ dragSource: sourceId, dragData: data });
    },

    setDropTarget: (targetId) => {
      set({ dropTarget: targetId });
    },

    endDrag: () => {
      set({ dragSource: null, dragData: null, dropTarget: null });
    },

    // === AI Context Actions ===
    setAIObserving: (panelId, isObserving) => {
      set((state) => ({
        panels: state.panels.map(p =>
          p.id === panelId ? { ...p, isAIObserving: isObserving } : p
        ),
        aiObservingPanels: isObserving
          ? [...state.aiObservingPanels, panelId]
          : state.aiObservingPanels.filter(id => id !== panelId)
      }));
    },

    updateGlobalContext: (key, value) => {
      set((state) => ({
        globalContext: { ...state.globalContext, [key]: value }
      }));
    },

    // === Marketplace Actions ===
    loadAvailablePanels: async () => {
      const marketplaceClient = getMarketplaceClient();
      set({ isLoadingPanels: true, panelsError: null });

      try {
        const { panels } = await marketplaceClient.getPanels();
        set({ availablePanels: panels, isLoadingPanels: false });
      } catch (error) {
        console.error('[StudioContext] Failed to load available panels:', error);
        set({ panelsError: error, isLoadingPanels: false });
      }
    },

    loadInstalledPanels: async () => {
      const marketplaceClient = getMarketplaceClient();
      set({ isLoadingPanels: true, panelsError: null });

      try {
        const installations = await marketplaceClient.getMyPanels();
        set({ installedPanels: installations, isLoadingPanels: false });
      } catch (error) {
        console.error('[StudioContext] Failed to load installed panels:', error);
        set({ panelsError: error, isLoadingPanels: false });
      }
    },

    installPanel: async (panelId) => {
      const marketplaceClient = getMarketplaceClient();

      try {
        const installation = await marketplaceClient.installPanel(panelId);

        // Refresh installed panels list
        await get().loadInstalledPanels();

        return installation;
      } catch (error) {
        console.error('[StudioContext] Failed to install panel:', error);
        throw error;
      }
    },

    addPanelToWorkspace: async (panelId) => {
      const marketplaceClient = getMarketplaceClient();
      const nexusClient = getNexusClient();

      try {
        // Get panel details from marketplace
        const panel = await marketplaceClient.getPanel(panelId);

        if (!panel) {
          throw new Error('Panel not found');
        }

        // Create runtime panel instance via workspace-kernel from NXML
        const response = await nexusClient.createPanelFromNXML(panel.nxmlSource, {});

        const runtimeId = response.id;

        // Add to active panels in workspace
        const panels = get().panels;
        set({
          panels: [
            ...panels,
            {
              id: runtimeId,
              panelTypeId: panel.id,
              title: panel.name,
              mode: 'flexible',
              state: {},
              order: panels.length,
              isAIObserving: false,
              // Store marketplace metadata
              _marketplace: {
                panelId: panel.id,
                name: panel.name,
                category: panel.category,
                icon: panel.icon,
                accentColor: panel.accentColor,
                nxmlSource: panel.nxmlSource,
              },
            }
          ],
        });

        return runtimeId;
      } catch (error) {
        console.error('[StudioContext] Failed to add panel to workspace:', error);
        throw error;
      }
    },

    removePanelFromWorkspace: async (id) => {
      const nexusClient = getNexusClient();
      const panel = get().panels.find(p => p.id === id);

      if (panel && panel._marketplace) {
        // Delete runtime instance from workspace-kernel
        try {
          await nexusClient.deletePanel(id);
        } catch (error) {
          console.error('[StudioContext] Failed to delete panel from workspace-kernel:', error);
        }
      }

      // Remove from local state
      set((state) => ({
        panels: state.panels.filter(p => p.id !== id),
        focusedPanelId: state.focusedPanelId === id ? null : state.focusedPanelId,
        activeFullscreenId: state.activeFullscreenId === id ? null : state.activeFullscreenId,
      }));
    },

    // === Selectors ===
    getVisiblePanels: () => {
      const state = get();
      return state.panels.filter(p => p.mode !== 'hidden');
    },

    getHiddenPanels: () => {
      const state = get();
      return state.panels.filter(p => p.mode === 'hidden');
    },

    getPanelById: (id) => {
      return get().panels.find(p => p.id === id);
    },

    // === Workspace Initialization ===
    // Note: Workspace initialization removed - panels are now added explicitly by users
    // No more builtin panels on workspace creation
  }))
);

export default useStudioStore;

// === Keyboard Shortcut Hook ===
export const useKeyboardShortcuts = () => {
  const { toggleCommandPalette, openAddPanelModal } = useStudioStore();

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K: Toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Cmd/Ctrl + N: Add new panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        openAddPanelModal();
      }

      // Escape: Close modals
      if (e.key === 'Escape') {
        useStudioStore.getState().closeCommandPalette();
        useStudioStore.getState().closeAddPanelModal();
        useStudioStore.getState().closeSettingsModal();
        useStudioStore.getState().closeHelpModal();
        useStudioStore.getState().closeNOGViewer();
        useStudioStore.getState().closePublishPanelModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};