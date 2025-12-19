import React from 'react';
import { Box } from 'lucide-react';
import { createPanelDefinition, PanelCategories, ContentTypes } from '../../src/panels/BasePanelInterface';
import App from './App';

/**
 * Nexus Panel Integration Wrapper
 * 
 * This file wraps your existing <App /> to work within Nexus.
 * It maps Nexus's panelState -> App props
 * And App callbacks -> Nexus's updateState
 */

// 1. Create a wrapper component
function EditorPanelWrapper({ panelState, updateState, isFocused }) {
    // Extract data from panelState to pass to your App
    // Default to empty string if state is new
    const content = panelState.content || '';

    // Handle changes from your App
    const handleContentChange = (newContent) => {
        // Update Nexus state (which persists/syncs)
        updateState({ content: newContent });
    };

    return (
        // Ensure height is 100% to fill the panel
        <div className="h-full w-full">
            <App
                initialContent={content}
                onContentChange={handleContentChange}
            />
        </div>
    );
}

// 2. Define the Panel
const ExampleEditorPanel = createPanelDefinition({
    id: 'example-editor',
    name: 'Example Editor',
    description: 'An example of integrating an external editor into Nexus',
    icon: Box, // Replace with your custom icon
    category: PanelCategories.CREATION,
    accentColor: 'indigo',

    // Render the wrapper
    renderMainView: (props) => <EditorPanelWrapper {...props} />,

    // Define initial state
    getInitialState: () => ({
        content: '// New file...',
        cursor: 0,
    }),

    // AI Integration (Optional but recommended)
    getLLMContext: async (panelState) => ({
        contentType: ContentTypes.TEXT_CODE,
        data: {
            code: panelState.content,
        },
        schemaVersion: '1.0',
    }),

    applyLLMChange: async (panelState, updateState, dslDiff) => {
        if (dslDiff.code) {
            updateState({ content: dslDiff.code });
            return true;
        }
        return false;
    }
});

export default ExampleEditorPanel;
