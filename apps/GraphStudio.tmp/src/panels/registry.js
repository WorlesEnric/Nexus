/**
 * Panel Registry - Central registry for all panel types
 * 
 * This allows dynamic registration of panel types,
 * making the IDE extensible without modifying core code.
 * 
 * Note: Legacy dummy panels have been removed. All panels are now
 * NXML-based and loaded from the marketplace.
 */

// Internal registry map
const panelRegistry = new Map();

/**
 * Register a panel type
 * @param {IStudioPanelDefinition} panelDefinition 
 */
export function registerPanel(panelDefinition) {
  if (panelRegistry.has(panelDefinition.id)) {
    console.warn(`Panel type "${panelDefinition.id}" is already registered. Overwriting.`);
  }
  panelRegistry.set(panelDefinition.id, panelDefinition);
}

/**
 * Get a panel definition by ID
 * @param {string} panelTypeId 
 * @returns {IStudioPanelDefinition | undefined}
 */
export function getPanelDefinition(panelTypeId) {
  return panelRegistry.get(panelTypeId);
}

/**
 * Get all registered panel types
 * @returns {IStudioPanelDefinition[]}
 */
export function getAllPanelDefinitions() {
  return Array.from(panelRegistry.values());
}

/**
 * Get panel types by category
 * @param {string} category 
 * @returns {IStudioPanelDefinition[]}
 */
export function getPanelsByCategory(category) {
  return getAllPanelDefinitions().filter(p => p.category === category);
}

/**
 * Check if a panel type is registered
 * @param {string} panelTypeId 
 * @returns {boolean}
 */
export function isPanelRegistered(panelTypeId) {
  return panelRegistry.has(panelTypeId);
}

/**
 * Unregister a panel type
 * @param {string} panelTypeId 
 */
export function unregisterPanel(panelTypeId) {
  panelRegistry.delete(panelTypeId);
}

/**
 * Get categories with their panels
 * @returns {Object<string, IStudioPanelDefinition[]>}
 */
export function getPanelsByCategories() {
  const categories = {};
  
  for (const panel of panelRegistry.values()) {
    if (!categories[panel.category]) {
      categories[panel.category] = [];
    }
    categories[panel.category].push(panel);
  }
  
  return categories;
}

/**
 * Initialize built-in panels
 * Note: All panels are now NXML-based and loaded from marketplace
 */
export function initializeBuiltInPanels() {
  // No built-in legacy panels - all panels are NXML-based
}

// Initialize on module load
initializeBuiltInPanels();

export default {
  registerPanel,
  getPanelDefinition,
  getAllPanelDefinitions,
  getPanelsByCategory,
  isPanelRegistered,
  unregisterPanel,
  getPanelsByCategories,
};
