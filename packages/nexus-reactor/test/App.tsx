/**
 * @nexus/reactor - Test Harness
 *
 * Test application for the Nexus Reactor implementation
 */

import React, { useEffect, useState } from 'react';
import { NexusReactor } from '../src/reactor';

// Server Monitor Example from the spec
const serverMonitorNXML = `
<NexusPanel title="Server Monitor" version="1.1.0">
  <Data>
    <State name="status" type="string" default="offline" />
    <State name="logs" type="list" default="[]" />
    <State name="cpu" type="number" default="0" />
    <State name="cpuTrend" type="string" default="up" />
    <Computed name="isOnline" value="$state.status === 'active'" />
  </Data>

  <Logic>
    <Extension name="nexus.http" alias="http" />

    <Tool name="checkHealth" description="Pings server status">
      <Handler>
        $log('Checking server health...');

        try {
          // Simulate API call
          await new Promise(resolve => {
            $log('Waiting for response...');
            resolve(null);
          });

          $state.status = 'active';
          $state.cpu = Math.floor(Math.random() * 100);
          $state.cpuTrend = $state.cpu > 80 ? 'down' : 'up';
          $state.logs.push('Health check completed at ' + new Date().toLocaleTimeString());
          $emit('toast', 'Health check complete');
        } catch (e) {
          $state.status = 'error';
          $state.logs.push('Check failed: ' + e.message);
        }
      </Handler>
    </Tool>

    <Tool name="clearLogs">
      <Handler>
        $state.logs = [];
        $emit('toast', 'Logs cleared');
      </Handler>
    </Tool>

    <Lifecycle on="mount">
      <Handler>
        $log('Server Monitor mounted');
        $state.status = 'idle';
      </Handler>
    </Lifecycle>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Container title="Control Panel">
        <Layout strategy="row" align="center">
          <StatusBadge
            id="status-badge"
            label="{$state.status}"
            status="{$state.status === 'active' ? 'success' : 'error'}"
          />
          <Metric label="CPU" value="{$state.cpu}" unit="%" trend="{$state.cpuTrend}" />
          <Action
            label="Refresh"
            trigger="checkHealth"
            variant="primary"
          />
        </Layout>
      </Container>

      <Container title="System Logs">
        <LogStream id="logs" data="{$state.logs}" height="200" />
        <Button label="Clear" trigger="clearLogs" variant="ghost" />
      </Container>
    </Layout>
  </View>
</NexusPanel>
`;

// Todo List Example (with Iterate and dynamic args)
const todoListNXML = `
<NexusPanel title="Tasks">
  <Data>
    <State name="todos" type="list" default="[]" />
    <State name="input" type="string" default="" />
    <Computed name="hasItems" value="$state.todos.length > 0" />
    <Computed name="itemCount" value="$state.todos.length" />
  </Data>

  <Logic>
    <Tool name="add" description="Add a new todo item">
      <Handler>
        if ($state.input) {
          $state.todos.push({ id: Date.now(), text: $state.input, done: false });
          $state.input = "";
        }
      </Handler>
    </Tool>

    <Tool name="remove" description="Remove a todo by ID">
      <Arg name="id" type="number" required="true" description="Todo item ID" />
      <Handler>
        $state.todos = $state.todos.filter(t => t.id !== $args.id);
      </Handler>
    </Tool>

    <Tool name="toggle" description="Toggle todo completion">
      <Arg name="id" type="number" required="true" />
      <Handler>
        const todo = $state.todos.find(t => t.id === $args.id);
        if (todo) todo.done = !todo.done;
      </Handler>
    </Tool>

    <Lifecycle on="mount">
      <Handler>
        $log('Todo List mounted');
        $state.todos = [
          { id: 1, text: 'Learn NXML', done: false },
          { id: 2, text: 'Build a panel', done: false },
        ];
      </Handler>
    </Lifecycle>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Text content="Tasks" variant="h2" />
      <Text content="Total: {$state.itemCount}" variant="caption" />

      <Layout strategy="row" gap="sm">
        <Input bind="$state.input" placeholder="New Task..." />
        <Button label="Add" trigger="add" />
      </Layout>

      <If condition="{$state.hasItems}">
        <Iterate items="{$state.todos}" as="item" key="id">
          <Layout strategy="row" align="center" gap="sm">
            <Switch bind="$scope.item.done" />
            <Text content="{$scope.item.text}" />
            <Button
              label="X"
              variant="danger"
              trigger="remove"
              args="[$scope.item.id]"
            />
          </Layout>
        </Iterate>
      </If>
    </Layout>
  </View>
</NexusPanel>
`;

export default function DevHarness() {
  const [example, setExample] = useState<'server' | 'todo'>('server');
  const [PanelComponent, setPanelComponent] = useState<React.FC | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    try {
      setError(null);
      setLogs([]);

      const source = example === 'server' ? serverMonitorNXML : todoListNXML;

      // Initialize Reactor with MOCKED extensions
      const reactor = new NexusReactor({
        source,
        debug: true,

        // Mock the backend capabilities since Runwasi isn't here yet
        extensions: {
          http: {
            get: async (url: string) => {
              console.log('Mock HTTP GET:', url);
              return {
                json: { status: 'ok' },
                status: 200,
              };
            },
            post: async (url: string, data: unknown) => {
              console.log('Mock HTTP POST:', url, data);
              return {
                json: { success: true },
                status: 200,
              };
            },
          },
        },
      });

      // Subscribe to events
      reactor.events.on('mount', (event) => {
        const payload = event.payload as any;
        setLogs(prev => [...prev, `✅ Panel mounted: ${payload?.panelId ?? 'unknown'}`]);
      });

      reactor.events.on('toolExecute', (event) => {
        const payload = event.payload as any;
        setLogs(prev => [...prev, `🔧 Executing tool: ${payload?.tool ?? 'unknown'}`]);
      });

      reactor.events.on('error', (event) => {
        const payload = event.payload as any;
        setLogs(prev => [...prev, `❌ Error in ${payload?.tool}: ${payload?.error}`]);
      });

      reactor.events.on('emit', (event) => {
        const payload = event.payload as any;
        setLogs(prev => [...prev, `📤 Emit ${payload?.event}: ${payload?.payload}`]);
      });

      // LogStream doesn't have an 'on' method, we'll listen to reactor events instead
      reactor.events.onAll((event) => {
        if (event.type === 'stateChange') {
          // Don't log every state change, too noisy
          return;
        }
        // Log other events
        setLogs(prev => [...prev, `📝 Event: ${event.type}`]);
      });

      // Mount and retrieve the component
      reactor.mount().then(() => {
        // Use a functional update to store the component class/function in state
        setPanelComponent(() => reactor.getComponent());
      }).catch(err => {
        setError(`Mount failed: ${err.message}`);
      });

      return () => {
        reactor.unmount().catch(console.error);
      };
    } catch (err: any) {
      setError(`Initialization failed: ${err.message}\n${err.stack}`);
    }
  }, [example]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '1rem' }}>🧪 Nexus Reactor Test Harness</h1>

        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setExample('server')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: example === 'server' ? 'bold' : 'normal',
              backgroundColor: example === 'server' ? '#3b82f6' : '#e5e7eb',
              color: example === 'server' ? '#fff' : '#000',
            }}
          >
            Server Monitor
          </button>
          <button
            onClick={() => setExample('todo')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: example === 'todo' ? 'bold' : 'normal',
              backgroundColor: example === 'todo' ? '#3b82f6' : '#e5e7eb',
              color: example === 'todo' ? '#fff' : '#000',
            }}
          >
            Todo List
          </button>
        </div>

        {error && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#fee',
            border: '2px solid #f44',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            whiteSpace: 'pre-wrap',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          {/* Panel Display */}
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Panel Output</h2>
            {!PanelComponent && !error && <div>Booting Reactor...</div>}
            {PanelComponent && <PanelComponent />}
          </div>

          {/* Event Log */}
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Event Log</h2>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: '500px',
              overflowY: 'auto',
              backgroundColor: '#f9f9f9',
              padding: '0.5rem',
              borderRadius: '4px',
            }}>
              {logs.length === 0 ? (
                <div style={{ color: '#999' }}>No events yet...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ padding: '0.25rem 0' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h3 style={{ marginTop: 0 }}>ℹ️ Test Instructions</h3>
          <ul style={{ lineHeight: '1.6' }}>
            <li><strong>Server Monitor:</strong> Tests async handlers, state updates, computed values, and extensions</li>
            <li><strong>Todo List:</strong> Tests Iterate, dynamic args (thunk pattern), two-way binding, and control flow</li>
            <li>Check the Event Log to see reactor lifecycle events</li>
            <li>Open browser console to see debug logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
