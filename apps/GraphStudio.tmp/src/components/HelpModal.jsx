import React from 'react';
import useStudioStore from '../context/StudioContext';
import { motion } from 'framer-motion';
import { X, HelpCircle, Mail, MessageSquare, Globe } from 'lucide-react';

export default function HelpModal() {
    const { closeHelpModal } = useStudioStore();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={closeHelpModal}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-lg bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                        <HelpCircle className="text-text-primary" size={20} />
                        Help & Support
                    </h2>
                    <button
                        onClick={closeHelpModal}
                        className="p-1 rounded-lg hover:bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-text-secondary mb-6">
                        Need help with Nexus? Reach out to our support team or check our documentation.
                    </p>

                    <div className="space-y-3">
                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-tertiary border border-border hover:border-border-hover transition-all group">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-text-primary group-hover:scale-110 transition-transform">
                                <Mail size={20} />
                            </div>
                            <div>
                                <div className="font-medium text-text-primary">Contact Support</div>
                                <div className="text-sm text-text-muted">support@nexus.ide</div>
                            </div>
                        </a>

                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-tertiary border border-border hover:border-border-hover transition-all group">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-text-primary group-hover:scale-110 transition-transform">
                                <MessageSquare size={20} />
                            </div>
                            <div>
                                <div className="font-medium text-text-primary">Community Forum</div>
                                <div className="text-sm text-text-muted">discuss.nexus.ide</div>
                            </div>
                        </a>

                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-tertiary border border-border hover:border-border-hover transition-all group">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-text-primary group-hover:scale-110 transition-transform">
                                <Globe size={20} />
                            </div>
                            <div>
                                <div className="font-medium text-text-primary">Documentation</div>
                                <div className="text-sm text-text-muted">docs.nexus.ide</div>
                            </div>
                        </a>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
