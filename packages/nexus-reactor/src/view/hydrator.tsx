/**
 * @nexus/reactor - Hydrator
 * 
 * Transforms ViewAST into React components
 */

import React, { useEffect, useReducer, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import type { ViewNode, RuntimeValue } from '../core/types';
import { resolveBindings, isBindingExpression, extractExpression, evaluateExpression, parseArgsExpression } from '../utils/expression';
import type { ViewRegistry } from './registry';
import { registerComponent, unregisterComponent, getTransientProps } from './registry';
import type { StateStore } from '../state/store';
import { subscribe, unsubscribe, trackAccess } from '../state/store';
import { getChildLayoutStyles } from '../layout/engine';

// Component imports
import { LayoutComponent } from '../components/Layout';
import { ContainerComponent } from '../components/Container';
import { TextComponent } from '../components/Text';
import { MetricComponent } from '../components/Metric';
import { StatusBadgeComponent } from '../components/StatusBadge';
import { ButtonComponent } from '../components/Button';
import { InputComponent } from '../components/Input';
import { SwitchComponent } from '../components/Switch';
import { LogStreamComponent } from '../components/LogStream';
import { ChartComponent } from '../components/Chart';
import { IfComponent } from '../components/If';
import { IterateComponent } from '../components/Iterate';

// Component registry
const ComponentRegistry: Record<string, React.ComponentType<any>> = {
  Layout: LayoutComponent,
  Container: ContainerComponent,
  Text: TextComponent,
  Metric: MetricComponent,
  StatusBadge: StatusBadgeComponent,
  Button: ButtonComponent,
  Action: ButtonComponent, // Action is an alias for Button
  Input: InputComponent,
  Switch: SwitchComponent,
  LogStream: LogStreamComponent,
  Chart: ChartComponent,
  If: IfComponent,
  Iterate: IterateComponent,
};

// Context for passing reactor context down the tree
export interface HydrationContext {
  stateStore: StateStore;
  viewRegistry: ViewRegistry;
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  scope: Record<string, unknown>;
}

const HydrationContextValue = createContext<HydrationContext | null>(null);

export function useHydrationContext(): HydrationContext {
  const ctx = useContext(HydrationContextValue);
  if (!ctx) throw new Error('useHydrationContext must be used within HydrationProvider');
  return ctx;
}

interface HydrationProviderProps {
  stateStore: StateStore;
  viewRegistry: ViewRegistry;
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  children: React.ReactNode;
}

export function HydrationProvider({ stateStore, viewRegistry, executeTool, children }: HydrationProviderProps) {
  const contextValue = useMemo(() => ({
    stateStore,
    viewRegistry,
    executeTool,
    scope: {},
  }), [stateStore, viewRegistry, executeTool]);

  return (
    <HydrationContextValue.Provider value={contextValue}>
      {children}
    </HydrationContextValue.Provider>
  );
}

interface NXMLRendererProps {
  node: ViewNode;
  scope?: Record<string, unknown>;
}

export function NXMLRenderer({ node, scope = {} }: NXMLRendererProps) {
  const ctx = useHydrationContext();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const subscriberIdRef = useRef<string | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const id = `renderer-${node.id ?? Math.random().toString(36).slice(2)}`;
    subscriberIdRef.current = id;
    
    const unsub = subscribe(ctx.stateStore, forceUpdate, id);
    
    return () => {
      unsubscribe(ctx.stateStore, id);
    };
  }, [ctx.stateStore, node.id]);

  // Register component with view registry if it has an id
  useEffect(() => {
    if (node.id) {
      registerComponent(ctx.viewRegistry, node.id, node.type, null, forceUpdate);
      return () => unregisterComponent(ctx.viewRegistry, node.id!);
    }
  }, [node.id, node.type, ctx.viewRegistry]);

  // Get the component
  const Component = ComponentRegistry[node.type];
  if (!Component) {
    console.warn(`Unknown component type: ${node.type}`);
    return null;
  }

  // Create evaluation context
  const evalContext = {
    $state: ctx.stateStore.proxy,
    $scope: scope,
  };

  // Resolve props with bindings
  const resolvedProps = useMemo(() => {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(node.props)) {
      if (typeof value === 'string' && isBindingExpression(value)) {
        // Track access and resolve
        const resolved = trackAccess(ctx.stateStore, subscriberIdRef.current ?? 'unknown', () => {
          const expr = extractExpression(value);
          return evaluateExpression(expr, evalContext);
        });
        result[key] = resolved;
      } else {
        result[key] = value;
      }
    }
    
    // Merge transient props
    if (node.id) {
      const transient = getTransientProps(ctx.viewRegistry, node.id);
      Object.assign(result, transient);
    }
    
    return result;
  }, [node.props, node.id, ctx.stateStore.proxy, scope, ctx.viewRegistry]);

  // Handle trigger/onClick
  const handleTrigger = useCallback(async () => {
    const triggerName = resolvedProps.trigger as string;
    if (!triggerName) return;

    // Resolve args at interaction time (thunk pattern)
    let args: unknown = {};
    if (node.props.args) {
      args = parseArgsExpression(node.props.args as string, evalContext);
    }

    try {
      await ctx.executeTool(triggerName, args as Record<string, unknown>);
    } catch (error) {
      console.error(`Error executing tool ${triggerName}:`, error);
    }
  }, [resolvedProps.trigger, node.props.args, evalContext, ctx.executeTool]);

  // Handle two-way binding (for Input, Switch)
  const handleBind = useCallback((newValue: unknown) => {
    const bindPath = node.props.bind as string;
    if (!bindPath) return;

    // Parse the bind path (e.g., "$state.count" -> "count")
    const match = bindPath.match(/^\$state\.(.+)$/);
    if (match) {
      ctx.stateStore.proxy[match[1]] = newValue as RuntimeValue;
    }
  }, [node.props.bind, ctx.stateStore.proxy]);

  // Get bound value for two-way binding
  const boundValue = useMemo(() => {
    const bindPath = node.props.bind as string;
    if (!bindPath) return undefined;

    const match = bindPath.match(/^\$state\.(.+)$/);
    if (match) {
      return ctx.stateStore.proxy[match[1]];
    }
    return undefined;
  }, [node.props.bind, ctx.stateStore.proxy]);

  // Build final props
  const finalProps = {
    ...resolvedProps,
    onTrigger: resolvedProps.trigger ? handleTrigger : undefined,
    onBind: node.props.bind ? handleBind : undefined,
    boundValue,
    style: node.layout ? getChildLayoutStyles(node.layout) : undefined,
  };

  // Render children
  const renderChildren = useCallback((childScope: Record<string, unknown> = scope) => {
    return node.children.map((child, index) => (
      <NXMLRenderer 
        key={child.id ?? `${node.type}-child-${index}`} 
        node={child} 
        scope={childScope}
      />
    ));
  }, [node.children, node.type, scope]);

  // Special handling for control flow components
  if (node.type === 'If') {
    return (
      <Component {...finalProps} evalContext={evalContext}>
        {renderChildren}
      </Component>
    );
  }

  if (node.type === 'Iterate') {
    return (
      <Component {...finalProps} evalContext={evalContext} scope={scope}>
        {(itemScope: Record<string, unknown>) => renderChildren(itemScope)}
      </Component>
    );
  }

  // Regular components
  return (
    <Component {...finalProps}>
      {node.children.length > 0 && renderChildren()}
    </Component>
  );
}

export function createPanelComponent(
  viewAST: { root: ViewNode },
  stateStore: StateStore,
  viewRegistry: ViewRegistry,
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>
): React.FC {
  return function PanelComponent() {
    return (
      <HydrationProvider
        stateStore={stateStore}
        viewRegistry={viewRegistry}
        executeTool={executeTool}
      >
        <NXMLRenderer node={viewAST.root} />
      </HydrationProvider>
    );
  };
}