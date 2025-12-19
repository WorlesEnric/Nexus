# Example Editor Integration

This folder demonstrates how to integrate a standalone React application (your "editor") into the Nexus IDE.

## Structure

- `src/App.jsx`: Your existing editor application/component.
- `src/main.jsx` & `index.html`: Standard Vite/React entry points. You can run `npm install && npm run dev` *in this directory* to work on your editor in isolation.
- `src/Panel.jsx`: **The Bridge**. This file imports your `App` and wraps it using `createPanelDefinition` to make it a compatible Nexus Panel.

## How to Integrate

1. **Move your code**: Copy your editor's source code into this folder (or a similar structure).
2. **Adapt Panel.jsx**:
   - Import your main component.
   - Map `panelState` to your component's props.
   - Map your component's `onChange` events to `updateState`.
3. **Register in Nexus**:
   - Open `Nexus/src/panels/registry.js`.
   - Import the panel definition:
     ```javascript
     import ExampleEditorPanel from '../../example/src/Panel'; 
     // Note: You might want to move the panel definition file into src/panels/ if you prefer, 
     // but importing from root/example works too for testing.
     ```
   - Add `registerPanel(ExampleEditorPanel)` to `initializeBuiltInPanels`.

## "I don't write JSX"

If your editors use pure JS or another method:
1. Ensure your build pipeline works (Vite handles most things).
2. If you export a function that mounts to a DOM element, you can use a `ref` in the Wrapper:

```javascript
function Wrapper({ updateState }) {
  const ref = useRef(null);
  
  useEffect(() => {
    if (ref.current) {
      // Mount your vanilla JS app here
      const app = MyEditor.mount(ref.current);
      app.on('change', data => updateState({ data }));
      return () => app.destroy();
    }
  }, []);

  return <div ref={ref} className="h-full" />;
}
```
