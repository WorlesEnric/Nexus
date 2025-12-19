// Auto-generated TriLog TypeScript definitions
// Registry: graphstudio v1.0.0

export namespace TriLog {
  export interface User {
    __id__: string;
    __type__: 'User';
    __version__: number;
    email: string | null;
    name: string | null;
    is_active?: boolean | null;
    is_verified?: boolean | null;
    created_at?: string | null;
    last_login_at?: string | null;
    subscription_tier?: string | null;
    tokens_used?: number | null;
    active_panels?: number | null;
  }

  export interface Subscription {
    __id__: string;
    __type__: 'Subscription';
    __version__: number;
    user_id: string | null;
    tier?: string | null;
    status?: string | null;
    token_budget?: number | null;
    max_panels?: number | null;
    storage_quota_mb?: number | null;
    tokens_used_this_period?: number | null;
    current_period_start?: string | null;
  }

  export interface APIRequest {
    __id__: string;
    __type__: 'APIRequest';
    __version__: number;
    method: string | null;
    path: string | null;
    status_code?: number | null;
    duration_ms?: number | null;
    user_id?: string | null;
  }

  export interface WebSocketConnection {
    __id__: string;
    __type__: 'WebSocketConnection';
    __version__: number;
    panel_id: string | null;
    is_connected?: boolean | null;
    connected_at?: string | null;
    disconnected_at?: string | null;
    last_error?: string | null;
    reconnect_attempts?: number | null;
  }

  export interface Panel {
    __id__: string;
    __type__: 'Panel';
    __version__: number;
    panel_id: string | null;
    workspace_id?: string | null;
    panel_type: string | null;
    name?: string | null;
    state?: string | null;
    is_running?: boolean | null;
    version?: number | null;
  }

  export interface Workspace {
    __id__: string;
    __type__: 'Workspace';
    __version__: number;
    owner_id: string | null;
    name: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
    last_accessed_at?: string | null;
    panel_count?: number | null;
    storage_used_mb?: number | null;
  }

  export type AnyObject = User | Subscription | APIRequest | WebSocketConnection | Panel | Workspace;
}
