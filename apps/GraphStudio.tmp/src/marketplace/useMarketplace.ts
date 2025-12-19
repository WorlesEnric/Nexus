/**
 * useMarketplace - React hooks for marketplace operations
 *
 * Provides easy-to-use hooks for:
 * - Browsing panels
 * - Managing installations
 * - Publishing panels
 * - Reviews and ratings
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getMarketplaceClient,
  Panel,
  Installation,
  PanelFilters,
  PublishPanelData,
  UpdatePanelData,
  SubmitReviewData,
  Review,
  CategoryInfo,
} from './MarketplaceClient';

/**
 * Hook to get the marketplace client instance
 */
export function useMarketplaceClient() {
  return getMarketplaceClient();
}

/**
 * Hook to browse marketplace panels with filters
 */
export function useMarketplacePanels(filters?: PanelFilters) {
  const client = useMarketplaceClient();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getPanels(filters);
      setPanels(data.panels);
      setCount(data.count);
    } catch (err) {
      console.error('[useMarketplacePanels] Failed to load panels:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, filters?.category, filters?.search, filters?.type, filters?.sort]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { panels, count, isLoading, error, refresh };
}

/**
 * Hook to get a specific panel by ID
 */
export function usePanel(panelId: string | null) {
  const client = useMarketplaceClient();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!panelId) {
      setPanel(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getPanel(panelId);
      setPanel(data);
    } catch (err) {
      console.error('[usePanel] Failed to load panel:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, panelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { panel, isLoading, error, refresh };
}

/**
 * Hook to get user's installed panels
 */
export function useMyPanels() {
  const client = useMarketplaceClient();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getMyPanels();
      setInstallations(data);
    } catch (err) {
      console.error('[useMyPanels] Failed to load installed panels:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { installations, isLoading, error, refresh };
}

/**
 * Hook to manage panel installation
 */
export function usePanelInstallation(panelId: string | null) {
  const client = useMarketplaceClient();
  const [isInstalled, setIsInstalled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkInstallation = useCallback(async () => {
    if (!panelId) {
      setIsInstalled(false);
      return;
    }

    try {
      const installed = await client.isInstalled(panelId);
      setIsInstalled(installed);
    } catch (err) {
      console.error('[usePanelInstallation] Failed to check installation:', err);
    }
  }, [client, panelId]);

  useEffect(() => {
    checkInstallation();
  }, [checkInstallation]);

  const install = useCallback(async () => {
    if (!panelId) {
      throw new Error('No panel ID provided');
    }

    setIsLoading(true);
    setError(null);

    try {
      await client.installPanel(panelId);
      setIsInstalled(true);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client, panelId]);

  const uninstall = useCallback(async () => {
    if (!panelId) {
      throw new Error('No panel ID provided');
    }

    setIsLoading(true);
    setError(null);

    try {
      await client.uninstallPanel(panelId);
      setIsInstalled(false);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client, panelId]);

  return { isInstalled, isLoading, error, install, uninstall };
}

/**
 * Hook to publish panels
 */
export function usePanelPublishing() {
  const client = useMarketplaceClient();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const publish = useCallback(async (data: PublishPanelData): Promise<Panel> => {
    setIsPublishing(true);
    setError(null);

    try {
      const panel = await client.publishPanel(data);
      return panel;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsPublishing(false);
    }
  }, [client]);

  const update = useCallback(async (panelId: string, data: UpdatePanelData): Promise<Panel> => {
    setIsPublishing(true);
    setError(null);

    try {
      const panel = await client.updatePanel(panelId, data);
      return panel;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsPublishing(false);
    }
  }, [client]);

  const deletePanel = useCallback(async (panelId: string): Promise<void> => {
    setIsPublishing(true);
    setError(null);

    try {
      await client.deletePanel(panelId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsPublishing(false);
    }
  }, [client]);

  return { isPublishing, error, publish, update, deletePanel };
}

/**
 * Hook to get user's published panels
 */
export function useMyPublishedPanels() {
  const client = useMarketplaceClient();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getMyPublishedPanels();
      setPanels(data);
    } catch (err) {
      console.error('[useMyPublishedPanels] Failed to load published panels:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { panels, isLoading, error, refresh };
}

/**
 * Hook to manage panel reviews
 */
export function usePanelReviews(panelId: string | null) {
  const client = useMarketplaceClient();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!panelId) {
      setReviews([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getReviews(panelId);
      setReviews(data);
    } catch (err) {
      console.error('[usePanelReviews] Failed to load reviews:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, panelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitReview = useCallback(async (data: SubmitReviewData): Promise<Review> => {
    if (!panelId) {
      throw new Error('No panel ID provided');
    }

    setError(null);

    try {
      const review = await client.submitReview(panelId, data);
      await refresh(); // Refresh reviews list
      return review;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [client, panelId, refresh]);

  return { reviews, isLoading, error, submitReview, refresh };
}

/**
 * Hook to get marketplace categories
 */
export function useCategories() {
  const client = useMarketplaceClient();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await client.getCategories();
      setCategories(data);
    } catch (err) {
      console.error('[useCategories] Failed to load categories:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { categories, isLoading, error, refresh };
}
