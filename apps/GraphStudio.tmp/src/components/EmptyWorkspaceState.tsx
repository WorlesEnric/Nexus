import { motion } from 'framer-motion';

interface EmptyWorkspaceStateProps {
  onAddPanel?: () => void;
}

export default function EmptyWorkspaceState({ onAddPanel }: EmptyWorkspaceStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full min-h-[600px] px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center max-w-md">
        {/* Icon */}
        <motion.div
          className="inline-flex items-center justify-center w-24 h-24 bg-gray-800 rounded-full mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h2
          className="text-4xl font-bold text-gray-300 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          No Active Panels
        </motion.h2>

        {/* Description */}
        <motion.p
          className="text-gray-500 mb-8 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          This workspace is empty. Add panels from your library or install new ones from the marketplace to get started.
        </motion.p>

        {/* Action Button */}
        {onAddPanel && (
          <motion.button
            onClick={onAddPanel}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/50 transform hover:scale-105"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Panel
          </motion.button>
        )}

        {/* Keyboard Shortcut Hint */}
        <motion.div
          className="mt-8 text-gray-600 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p>
            Or press{' '}
            <kbd className="px-2 py-1 bg-gray-800 rounded border border-gray-700 font-mono text-xs">⌘</kbd>
            {' + '}
            <kbd className="px-2 py-1 bg-gray-800 rounded border border-gray-700 font-mono text-xs">P</kbd>
            {' '}to add a panel
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
