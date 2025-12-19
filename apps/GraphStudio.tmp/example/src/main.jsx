import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Standalone entry point
// Used when developing the editor in isolation (e.g. 'npm run dev' inside example/)

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <div style={{ height: '100vh', width: '100vw' }}>
            <App
                initialContent="Running in Standalone Mode"
                onContentChange={(val) => console.log('Standalone save:', val)}
            />
        </div>
    </React.StrictMode>,
);
