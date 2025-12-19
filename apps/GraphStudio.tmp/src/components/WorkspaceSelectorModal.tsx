import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { motion, AnimatePresence } from 'framer-motion';
import CreateWorkspaceModal from './CreateWorkspaceModal';

interface WorkspaceSelectorModalProps {
  onClose: () => void;
}

export default function WorkspaceSelectorModal({ onClose }: WorkspaceSelectorModalProps) {
  const { workspaceList, isLoading, openWorkspace } = useWorkspace();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSelectWorkspace = async (workspaceId: string) => {
    try {
      await openWorkspace(workspaceId);
      onClose(); // Close modal after successful open
    } catch (err) {
      console.error('Failed to open workspace:', err);
      alert('Failed to open workspace. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-700"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900">
            <div>
              <h2 className="text-2xl font-bold text-white">Open Workspace</h2>
              <p className="text-gray-400 text-sm mt-1">Select a workspace to continue</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Workspace List */}
          <div className="p-6 overflow-y-auto max-h-[500px]">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                <p className="text-gray-400 mt-4">Loading workspaces...</p>
              </div>
            ) : workspaceList.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-400 text-lg">No workspaces found</p>
                <p className="text-gray-500 text-sm mt-2">Create your first workspace to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {workspaceList.map((workspace) => (
                  <motion.button
                    key={workspace.id}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                    className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-all duration-200 text-left group border border-transparent hover:border-blue-500/50"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Workspace Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg group-hover:shadow-blue-500/50 transition-shadow">
                        {workspace.name.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Workspace Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                        {workspace.name}
                      </h3>
                      {workspace.description && (
                        <p className="text-sm text-gray-400 mt-1 truncate">
                          {workspace.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          {workspace.panel_count} panel{workspace.panel_count !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {workspace.status}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0 text-gray-400 group-hover:text-blue-400 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700 bg-gray-900/50">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-blue-500/50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Workspace
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Create Workspace Modal (nested) */}
      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            // Workspace list will auto-refresh via context
          }}
        />
      )}
    </AnimatePresence>
  );
}
