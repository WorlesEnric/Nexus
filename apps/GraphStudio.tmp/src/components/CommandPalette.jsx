import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Command,
  ArrowRight,
  Plus,
  Eye,
  EyeOff,
  Maximize2,
  Trash2,
  Download,
  Settings,
  HelpCircle,
  Sparkles,
  Layout
} from 'lucide-react';
import useStudioStore from '../context/StudioContext';
import { getAllPanelDefinitions, getPanelDefinition } from '../panels/registry';

/**
 * CommandPalette - Quick action dialog (⌘K)
 * 
 * Provides:
 * - Panel actions (show/hide/focus)
 * - Global commands
 * - Panel-specific actions
 * - Fuzzy search
 */
export default function CommandPalette() {
  const {
    closeCommandPalette,
    panels,
    updatePanelMode,
    setFocusedPanel,
    removePanel,
    openAddPanelModal
  } = useStudioStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build command list
  const commands = useMemo(() => {
    const cmds = [];

    // Global commands
    cmds.push({
      id: 'add-panel',
      label: 'Add New Panel',
      description: 'Create a new panel in the workspace',
      icon: Plus,
      category: 'Global',
      action: () => {
        closeCommandPalette();
        openAddPanelModal();
      }
    });

    cmds.push({
      id: 'settings',
      label: 'Open Settings',
      description: 'Configure IDE settings',
      icon: Settings,
      category: 'Global',
      action: () => {
        closeCommandPalette();
        // TODO: Open settings
      }
    });

    cmds.push({
      id: 'help',
      label: 'Help & Documentation',
      description: 'View help and keyboard shortcuts',
      icon: HelpCircle,
      category: 'Global',
      action: () => {
        closeCommandPalette();
        // TODO: Open help
      }
    });

    // Panel commands
    panels.forEach(panel => {
      let panelDef = getPanelDefinition(panel.panelTypeId);

      // Create fallback panelDef for marketplace panels
      if (!panelDef && panel._marketplace) {
        panelDef = {
          id: panel._marketplace.panelId,
          name: panel._marketplace.name,
          icon: ({ size }) => (
            <span style={{ fontSize: size || 16 }}>{panel._marketplace.icon}</span>
          ),
          category: panel._marketplace.category,
          accentColor: panel._marketplace.accentColor,
          exportFormats: [],
        };
      }

      if (!panelDef) return;

      const Icon = panelDef.icon;

      // Show/Hide panel
      if (panel.mode === 'hidden') {
        cmds.push({
          id: `show-${panel.id}`,
          label: `Show ${panel.title}`,
          description: `Show the ${panel.title} panel`,
          icon: Eye,
          panelIcon: Icon,
          category: 'Panels',
          action: () => {
            updatePanelMode(panel.id, 'flexible');
            setFocusedPanel(panel.id);
            closeCommandPalette();
          }
        });
      } else {
        cmds.push({
          id: `hide-${panel.id}`,
          label: `Hide ${panel.title}`,
          description: `Hide the ${panel.title} panel`,
          icon: EyeOff,
          panelIcon: Icon,
          category: 'Panels',
          action: () => {
            updatePanelMode(panel.id, 'hidden');
            closeCommandPalette();
          }
        });

        cmds.push({
          id: `focus-${panel.id}`,
          label: `Focus ${panel.title}`,
          description: `Bring ${panel.title} into focus`,
          icon: Maximize2,
          panelIcon: Icon,
          category: 'Panels',
          action: () => {
            setFocusedPanel(panel.id);
            closeCommandPalette();
          }
        });
      }

      // Remove panel
      cmds.push({
        id: `remove-${panel.id}`,
        label: `Remove ${panel.title}`,
        description: `Permanently remove the ${panel.title} panel`,
        icon: Trash2,
        panelIcon: Icon,
        category: 'Panels',
        danger: true,
        action: () => {
          removePanel(panel.id);
          closeCommandPalette();
        }
      });

      // Panel-specific actions
      panelDef.actions?.forEach(action => {
        cmds.push({
          id: `${panel.id}-${action.id}`,
          label: action.label,
          description: `${panel.title}: ${action.label}`,
          icon: Sparkles,
          panelIcon: Icon,
          category: panel.title,
          shortcut: action.shortcut,
          action: () => {
            action.handler?.(panel.state, (newState) => {
              // updatePanelState would be called here
            });
            closeCommandPalette();
          }
        });
      });
    });

    // Add panel type shortcuts
    getAllPanelDefinitions().forEach(panelDef => {
      cmds.push({
        id: `create-${panelDef.id}`,
        label: `New ${panelDef.name}`,
        description: panelDef.description,
        icon: Plus,
        panelIcon: panelDef.icon,
        category: 'Create',
        action: () => {
          closeCommandPalette();
          openAddPanelModal();
        }
      });
    });

    return cmds;
  }, [panels, closeCommandPalette, updatePanelMode, setFocusedPanel, removePanel, openAddPanelModal]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.category?.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups = {};
    filteredCommands.forEach(cmd => {
      const cat = cmd.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return Object.values(groupedCommands).flat();
  }, [groupedCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          flatCommands[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeCommandPalette();
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={closeCommandPalette}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 animate-slide-up">
        <div className="rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
            <div className="p-2 rounded-lg bg-zinc-800">
              <Command size={18} className="text-white" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 text-base text-white placeholder-zinc-500 bg-transparent outline-none"
            />
            <kbd className="px-2 py-1 rounded bg-zinc-800 text-zinc-500 text-xs font-mono">
              esc
            </kbd>
          </div>

          {/* Command list */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
            {flatCommands.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Search size={32} className="mx-auto mb-3 text-zinc-600" />
                <p className="text-sm text-zinc-500">No commands found</p>
                <p className="text-xs text-zinc-600 mt-1">Try a different search term</p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {category}
                  </div>

                  {/* Commands */}
                  {cmds.map((cmd, idx) => {
                    const globalIdx = flatCommands.indexOf(cmd);
                    const isSelected = globalIdx === selectedIndex;
                    const Icon = cmd.icon;
                    const PanelIcon = cmd.panelIcon;

                    return (
                      <button
                        key={cmd.id}
                        data-index={globalIdx}
                        onClick={cmd.action}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2.5 transition-colors
                          ${isSelected ? 'bg-zinc-800' : 'hover:bg-white/5'}
                          ${cmd.danger ? 'hover:bg-red-900/20' : ''}
                        `}
                      >
                        {/* Icon */}
                        <div className={`
                          p-2 rounded-lg 
                          ${isSelected
                            ? cmd.danger ? 'bg-red-500/20' : 'bg-white text-black'
                            : 'bg-zinc-800 text-zinc-400'
                          }
                        `}>
                          <Icon
                            size={16}
                            className={
                              isSelected
                                ? cmd.danger ? 'text-red-400' : 'text-black'
                                : 'text-zinc-400'
                            }
                          />
                        </div>

                        {/* Label & description */}
                        <div className="flex-1 text-left">
                          <div className={`text-sm font-medium ${isSelected ? cmd.danger ? 'text-red-300' : 'text-white' : 'text-zinc-300'}`}>
                            {cmd.label}
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {cmd.description}
                            </div>
                          )}
                        </div>

                        {/* Panel icon */}
                        {PanelIcon && (
                          <PanelIcon size={14} className="text-zinc-600" />
                        )}

                        {/* Shortcut */}
                        {cmd.shortcut && (
                          <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-xs font-mono">
                            {cmd.shortcut}
                          </kbd>
                        )}

                        {/* Arrow */}
                        {isSelected && (
                          <ArrowRight size={14} className={cmd.danger ? 'text-red-400' : 'text-white'} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-black/20">
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">↵</kbd>
                Select
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Layout size={12} className="text-zinc-600" />
              <span className="text-xs text-zinc-600">GraphStudio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}