/**
 * MarketplaceClient - HTTP client for marketplace operations
 *
 * Provides methods for:
 * - Browsing and searching panels
 * - Installing/uninstalling panels
 * - Publishing panels
 * - Reviewing panels
 * - Managing user's panel collection
 */

export interface Panel {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  accentColor: string;
  nxmlSource: string;
  hasCustomComponents: boolean;
  authorId: string;
  author: {
    id: string;
    fullName: string | null;
    email: string;
  };
  visibility: string;
  type: 'nexus' | 'free' | 'paid';
  price: number | null;
  tags: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  installCount: number;
  averageRating: number | null;
  _count?: {
    installations: number;
    reviews: number;
  };
}

export interface PanelVersion {
  id: string;
  panelId: string;
  version: string;
  nxmlSource: string;
  changelog: string | null;
  createdAt: string;
}

export interface CustomComponent {
  id: string;
  panelId: string;
  name: string;
  module: string;
  bundleUrl: string | null;
  createdAt: string;
}

export interface Installation {
  id: string;
  userId: string;
  panelId: string;
  panel: Panel;
  installedAt: string;
  version: string;
  isActive: boolean;
}

export interface Review {
  id: string;
  userId: string;
  panelId: string;
  rating: number;
  comment: string | null;
  user: {
    fullName: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PanelFilters {
  category?: string;
  search?: string;
  type?: 'nexus' | 'free' | 'paid';
  sort?: 'popular' | 'recent' | 'rating' | 'name';
}

export interface PublishPanelData {
  name: string;
  description: string;
  category: string;
  icon: string;
  accentColor: string;
  nxmlSource: string;
  tags?: string[];
}

export interface UpdatePanelData {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  accentColor?: string;
  nxmlSource?: string;
  tags?: string[];
  visibility?: 'draft' | 'published' | 'unlisted' | 'deprecated';
}

export interface SubmitReviewData {
  rating: number;
  comment?: string;
}

export interface CategoryInfo {
  name: string;
  slug: string;
  count: number;
}

/**
 * MarketplaceClient for communicating with backend marketplace API
 */
export class MarketplaceClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Use the same backend as auth (VITE_API_BASE_URL) + /marketplace
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30090';
    this.baseUrl = baseUrl || `${apiBaseUrl}/marketplace`;
  }

  /**
   * Get authentication token from localStorage
   */
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Create headers with optional authentication
   */
  private createHeaders(requireAuth: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (requireAuth) {
      const token = this.getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Handle fetch response with error checking
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  }

  // =============================================================================
  // Panel Browsing & Search
  // =============================================================================

  /**
   * Get all available panels with optional filters
   */
  async getPanels(filters?: PanelFilters): Promise<{ panels: Panel[]; count: number }> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.sort) params.append('sort', filters.sort);

    const response = await fetch(`${this.baseUrl}/panels?${params.toString()}`, {
      headers: this.createHeaders(true),
    });
    return this.handleResponse<{ panels: Panel[]; count: number }>(response);
  }

  /**
   * Get panel details by ID
   */
  async getPanel(id: string): Promise<Panel> {
    const response = await fetch(`${this.baseUrl}/panels/${id}`, {
      headers: this.createHeaders(true),
    });
    const data = await this.handleResponse<{ panel: Panel }>(response);
    return data.panel;
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<CategoryInfo[]> {
    const response = await fetch(`${this.baseUrl}/categories`, {
      headers: this.createHeaders(true),
    });
    const data = await this.handleResponse<{ categories: CategoryInfo[] }>(response);
    return data.categories;
  }

  // =============================================================================
  // Panel Installation
  // =============================================================================

  /**
   * Install a panel for the current user
   */
  async installPanel(panelId: string): Promise<Installation> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}/install`, {
      method: 'POST',
      headers: this.createHeaders(true),
    });
    const data = await this.handleResponse<{ installation: Installation; message: string }>(response);
    return data.installation;
  }

  /**
   * Uninstall a panel for the current user
   */
  async uninstallPanel(panelId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}/uninstall`, {
      method: 'POST',
      headers: this.createHeaders(true),
    });
    await this.handleResponse<{ message: string }>(response);
  }

  /**
   * Get user's installed panels
   */
  async getMyPanels(): Promise<Installation[]> {
    const response = await fetch(`${this.baseUrl}/my-panels`, {
      headers: this.createHeaders(true),
    });
    const data = await this.handleResponse<{ installations: Installation[] }>(response);
    return data.installations;
  }

  /**
   * Check if a panel is installed
   */
  async isInstalled(panelId: string): Promise<boolean> {
    try {
      const installations = await this.getMyPanels();
      return installations.some(i => i.panelId === panelId && i.isActive);
    } catch (error) {
      console.error('[MarketplaceClient] Failed to check installation status:', error);
      return false;
    }
  }

  // =============================================================================
  // Panel Publishing
  // =============================================================================

  /**
   * Publish a new panel
   */
  async publishPanel(data: PublishPanelData): Promise<Panel> {
    const response = await fetch(`${this.baseUrl}/panels`, {
      method: 'POST',
      headers: this.createHeaders(true),
      body: JSON.stringify(data),
    });
    const result = await this.handleResponse<{ panel: Panel; message: string }>(response);
    return result.panel;
  }

  /**
   * Update an existing panel
   */
  async updatePanel(panelId: string, data: UpdatePanelData): Promise<Panel> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}`, {
      method: 'PATCH',
      headers: this.createHeaders(true),
      body: JSON.stringify(data),
    });
    const result = await this.handleResponse<{ panel: Panel; message: string }>(response);
    return result.panel;
  }

  /**
   * Delete a panel (author only)
   */
  async deletePanel(panelId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}`, {
      method: 'DELETE',
      headers: this.createHeaders(true),
    });
    await this.handleResponse<{ message: string }>(response);
  }

  /**
   * Get user's published panels
   */
  async getMyPublishedPanels(): Promise<Panel[]> {
    const response = await fetch(`${this.baseUrl}/my-published`, {
      headers: this.createHeaders(true),
    });
    const data = await this.handleResponse<{ panels: Panel[] }>(response);
    return data.panels;
  }

  // =============================================================================
  // Reviews & Ratings
  // =============================================================================

  /**
   * Submit or update a review for a panel
   */
  async submitReview(panelId: string, data: SubmitReviewData): Promise<Review> {
    const response = await fetch(`${this.baseUrl}/panels/${panelId}/reviews`, {
      method: 'POST',
      headers: this.createHeaders(true),
      body: JSON.stringify(data),
    });
    const result = await this.handleResponse<{ review: Review; message: string }>(response);
    return result.review;
  }

  /**
   * Get reviews for a panel
   */
  async getReviews(panelId: string): Promise<Review[]> {
    const panel = await this.getPanel(panelId);
    // Reviews are included in the panel details from the marketplace API
    return (panel as any).reviews || [];
  }

  // =============================================================================
  // Version Management
  // =============================================================================

  /**
   * Get version history for a panel
   */
  async getVersions(panelId: string): Promise<PanelVersion[]> {
    const panel = await this.getPanel(panelId);
    // Versions are included in the panel details from the marketplace API
    return (panel as any).versions || [];
  }

  /**
   * Get custom components for a panel
   */
  async getCustomComponents(panelId: string): Promise<CustomComponent[]> {
    const panel = await this.getPanel(panelId);
    // Custom components are included in the panel details from the marketplace API
    return (panel as any).customComponents || [];
  }
}

/**
 * Create a singleton MarketplaceClient instance
 */
let globalClient: MarketplaceClient | null = null;

export function getMarketplaceClient(baseUrl?: string): MarketplaceClient {
  if (!globalClient) {
    globalClient = new MarketplaceClient(baseUrl);
  }
  return globalClient;
}

export function setMarketplaceClient(client: MarketplaceClient): void {
  globalClient = client;
}
