import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useNexusClient } from './NexusContext';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'suspended' | 'archived';
  panel_count: number;
  created_at: string;
}

interface WorkspaceContextType {
  // State
  currentWorkspace: Workspace | null;
  workspaceList: Workspace[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  openWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  closeWorkspace: () => void;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, newName: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { user } = useAuth();
  const nexusClient = useNexusClient();

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's workspaces on mount (if authenticated)
  useEffect(() => {
    if (user && nexusClient) {
      loadWorkspaces();
    } else {
      setCurrentWorkspace(null);
      setWorkspaceList([]);
    }
  }, [user, nexusClient]);

  const loadWorkspaces = async () => {
    if (!nexusClient) return;

    setIsLoading(true);
    setError(null);
    try {
      const workspaces = await nexusClient.listWorkspaces();
      setWorkspaceList(workspaces);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspaces');
      console.error('Failed to load workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openWorkspace = async (workspaceId: string) => {
    if (!nexusClient) return;

    setIsLoading(true);
    setError(null);
    try {
      // Get workspace details
      const workspace = await nexusClient.getWorkspace(workspaceId);

      // Activate workspace in backend (load runtime resources)
      await nexusClient.activateWorkspace(workspaceId);

      // Set as current
      setCurrentWorkspace(workspace);

      // Store in localStorage for persistence
      localStorage.setItem('lastOpenedWorkspace', workspaceId);

      console.log('Workspace opened:', workspace);
    } catch (err: any) {
      setError(err.message || 'Failed to open workspace');
      console.error('Failed to open workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createWorkspace = async (name: string, description?: string): Promise<Workspace> => {
    if (!nexusClient) throw new Error('NexusClient not initialized');

    setIsLoading(true);
    setError(null);
    try {
      const workspace = await nexusClient.createWorkspace(name, description);

      // Refresh workspace list
      await loadWorkspaces();

      return workspace;
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
      console.error('Failed to create workspace:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const closeWorkspace = () => {
    setCurrentWorkspace(null);
    localStorage.removeItem('lastOpenedWorkspace');
  };

  const deleteWorkspace = async (workspaceId: string) => {
    if (!nexusClient) return;

    try {
      await nexusClient.deleteWorkspace(workspaceId);

      // If deleted workspace is current, close it
      if (currentWorkspace?.id === workspaceId) {
        closeWorkspace();
      }

      // Refresh list
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace');
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  };

  const renameWorkspace = async (workspaceId: string, newName: string) => {
    if (!nexusClient) return;

    try {
      await nexusClient.updateWorkspace(workspaceId, { name: newName });

      // Update current workspace if it's the one being renamed
      if (currentWorkspace?.id === workspaceId) {
        setCurrentWorkspace({ ...currentWorkspace, name: newName });
      }

      // Refresh list
      await loadWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Failed to rename workspace');
      console.error('Failed to rename workspace:', err);
      throw err;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaceList,
        isLoading,
        error,
        loadWorkspaces,
        openWorkspace,
        createWorkspace,
        closeWorkspace,
        deleteWorkspace,
        renameWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
