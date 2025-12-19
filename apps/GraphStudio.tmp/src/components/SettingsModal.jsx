import React from 'react';
import useStudioStore from '../context/StudioContext';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Moon, Sun, Keyboard, Monitor } from 'lucide-react';

export default function SettingsModal() {
    const { closeSettingsModal, theme, setTheme, shortcuts, updateShortcuts } = useStudioStore();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={closeSettingsModal}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
                    <button
                        onClick={closeSettingsModal}
                        className="p-1 rounded-lg hover:bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* Theme Section */}
                    <div>
                        <h3 className="text-sm font-medium text-text-secondary mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={16} /> Appearance
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setTheme('dark')}
                                className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${theme === 'dark'
                                    ? 'bg-secondary border-accent text-text-primary'
                                    : 'bg-tertiary border-border text-text-muted hover:bg-secondary'
                                    }`}
                            >
                                <Moon size={20} />
                                <span className="font-medium">Dark Mode</span>
                            </button>
                            <button
                                onClick={() => setTheme('light')}
                                className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${theme === 'light'
                                    ? 'bg-secondary border-accent text-text-primary'
                                    : 'bg-tertiary border-border text-text-muted hover:bg-secondary'
                                    }`}
                            >
                                <Sun size={20} />
                                <span className="font-medium">Light Mode</span>
                            </button>
                        </div>
                    </div>

                    {/* Keyboard Shortcuts Section */}
                    <div>
                        <h3 className="text-sm font-medium text-text-secondary mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Keyboard size={16} /> Keyboard Shortcuts
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-tertiary rounded-lg border border-border">
                                <span className="text-text-primary">Command Palette</span>
                                <div className="flex items-center gap-2 bg-primary px-2 py-1 rounded border border-border-hover">
                                    <span className="text-xs text-text-muted">⌘</span>
                                    <input
                                        type="text"
                                        value={shortcuts.commandPalette}
                                        onChange={(e) => updateShortcuts('commandPalette', e.target.value.slice(-1))}
                                        className="w-4 bg-transparent text-center text-text-primary focus:outline-none uppercase font-mono"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-tertiary rounded-lg border border-border">
                                <span className="text-text-primary">New Panel</span>
                                <div className="flex items-center gap-2 bg-primary px-2 py-1 rounded border border-border-hover">
                                    <span className="text-xs text-text-muted">⌘</span>
                                    <input
                                        type="text"
                                        value={shortcuts.newItem}
                                        onChange={(e) => updateShortcuts('newItem', e.target.value.slice(-1))}
                                        className="w-4 bg-transparent text-center text-text-primary focus:outline-none uppercase font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border flex justify-end">
                    <button
                        onClick={closeSettingsModal}
                        className="px-4 py-2 bg-accent hover:bg-accent/90 text-primary font-medium rounded-lg transition-colors"
                    >
                        Done
                    </button>
                </div>

            </motion.div>
        </div>
    );
}
