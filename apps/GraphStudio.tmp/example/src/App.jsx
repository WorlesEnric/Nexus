import React, { useState, useEffect } from 'react';

// This represents your sophisticated existing editor.
// It manages its own state but also accepts external state via props
// if you want to integrate deep with Nexus.

export default function App({ initialContent = "", onContentChange }) {
    const [content, setContent] = useState(initialContent);
    const [status, setStatus] = useState("Ready");

    useEffect(() => {
        // If external initialContent changes (e.g. from Nexus state update), sync it
        if (initialContent !== content) {
            setContent(initialContent);
        }
    }, [initialContent]);

    const handleChange = (e) => {
        const newValue = e.target.value;
        setContent(newValue);
        setStatus("Editing...");

        // Notify parent (Nexus or Standalone wrapper)
        if (onContentChange) {
            onContentChange(newValue);
        }

        setTimeout(() => setStatus("Ready"), 500);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#1e1e1e',
            color: '#fff',
            fontFamily: 'sans-serif'
        }}>
            <header style={{
                padding: '10px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span>My Sophisticated Editor</span>
                <span style={{ fontSize: '0.8em', opacity: 0.7 }}>{status}</span>
            </header>

            <div style={{ flex: 1, padding: '20px' }}>
                <textarea
                    value={content}
                    onChange={handleChange}
                    style={{
                        width: '100%',
                        height: '100%',
                        background: '#252525',
                        color: '#eee',
                        border: 'none',
                        padding: '10px',
                        resize: 'none',
                        outline: 'none',
                        fontSize: '14px'
                    }}
                    placeholder="Start typing..."
                />
            </div>
        </div>
    );
}
