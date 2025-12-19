/**
 * PublishPanelModal - Panel publishing workflow UI
 *
 * Allows users to create and publish their own panels to the marketplace
 *
 * Features:
 * - Create new panel with NXML editor
 * - Edit panel metadata (name, description, category, icon, tags)
 * - Preview panel before publishing
 * - Publish to marketplace (draft or published)
 * - Update existing panels
 */

import React, { useState } from 'react';
import { X, Upload, Eye, Save, AlertCircle, CheckCircle, Code, Info } from 'lucide-react';
import { usePanelPublishing } from '../marketplace/useMarketplace';
import { PublishPanelData } from '../marketplace/MarketplaceClient';

export interface PublishPanelModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Callback when panel is published
   */
  onPublished?: (panelId: string) => void;

  /**
   * Existing panel to edit (if updating)
   */
  existingPanel?: {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    accentColor: string;
    nxmlSource: string;
    tags: string;
  };
}

type Step = 'metadata' | 'nxml' | 'preview' | 'publish';

const CATEGORIES = [
  { value: 'creation', label: 'Creation' },
  { value: 'data', label: 'Data' },
  { value: 'ai', label: 'AI' },
  { value: 'utility', label: 'Utility' },
  { value: 'preview', label: 'Preview' },
];

const ACCENT_COLORS = [
  { value: 'violet', label: 'Violet', class: 'bg-violet-500' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'emerald', label: 'Emerald', class: 'bg-emerald-500' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const DEFAULT_NXML_TEMPLATE = `<NexusPanel id="my-panel" title="My Panel">
  <Data>
    <!-- Define your state here -->
    <State name="count" type="number" default="0" />
  </Data>

  <Logic>
    <!-- Define your tools here -->
    <Tool name="increment" description="Increment counter">
      <Handler>
        $state.count = $state.count + 1;
        return { success: true };
      </Handler>
    </Tool>
  </Logic>

  <View>
    <!-- Define your UI here -->
    <Layout strategy="flex" direction="column" gap="md">
      <Text className="text-2xl font-bold">Count: {$state.count}</Text>
      <Button trigger="increment">Increment</Button>
    </Layout>
  </View>
</NexusPanel>`;

/**
 * PublishPanelModal Component
 */
export function PublishPanelModal({
  isOpen,
  onClose,
  onPublished,
  existingPanel,
}: PublishPanelModalProps) {
  const [step, setStep] = useState<Step>('metadata');
  const { isPublishing, error, publish, update } = usePanelPublishing();

  // Form state
  const [name, setName] = useState(existingPanel?.name || '');
  const [description, setDescription] = useState(existingPanel?.description || '');
  const [category, setCategory] = useState(existingPanel?.category || 'utility');
  const [icon, setIcon] = useState(existingPanel?.icon || '📦');
  const [accentColor, setAccentColor] = useState(existingPanel?.accentColor || 'violet');
  const [tags, setTags] = useState(existingPanel?.tags || '');
  const [nxmlSource, setNxmlSource] = useState(existingPanel?.nxmlSource || DEFAULT_NXML_TEMPLATE);

  // Validation
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validateMetadata = () => {
    const errors: string[] = [];

    if (!name.trim()) errors.push('Panel name is required');
    if (name.length < 3) errors.push('Panel name must be at least 3 characters');
    if (!description.trim()) errors.push('Description is required');
    if (description.length < 10) errors.push('Description must be at least 10 characters');
    if (!category) errors.push('Category is required');

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const validateNXML = () => {
    const errors: string[] = [];

    if (!nxmlSource.trim()) {
      errors.push('NXML source is required');
    } else {
      // Basic NXML validation
      if (!nxmlSource.includes('<NexusPanel')) {
        errors.push('NXML must contain a <NexusPanel> root element');
      }
      if (!nxmlSource.includes('<Data>')) {
        errors.push('NXML must contain a <Data> section');
      }
      if (!nxmlSource.includes('<View>')) {
        errors.push('NXML must contain a <View> section');
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleNext = () => {
    if (step === 'metadata') {
      if (validateMetadata()) {
        setStep('nxml');
      }
    } else if (step === 'nxml') {
      if (validateNXML()) {
        setStep('preview');
      }
    } else if (step === 'preview') {
      setStep('publish');
    }
  };

  const handlePublish = async (visibility: 'draft' | 'published') => {
    try {
      const panelData: PublishPanelData = {
        name: name.trim(),
        description: description.trim(),
        category,
        icon,
        accentColor,
        nxmlSource,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      };

      let panelId: string;

      if (existingPanel) {
        // Update existing panel
        const updatedPanel = await update(existingPanel.id, { ...panelData, visibility });
        panelId = updatedPanel.id;
      } else {
        // Publish new panel
        const newPanel = await publish(panelData);
        panelId = newPanel.id;

        // Update visibility if needed
        if (visibility === 'published') {
          await update(panelId, { visibility: 'published' });
        }
      }

      onPublished?.(panelId);
      onClose();
    } catch (err) {
      console.error('[PublishPanelModal] Failed to publish panel:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Upload size={20} className="text-violet-400" />
              <h2 className="text-xl font-semibold text-white">
                {existingPanel ? 'Update Panel' : 'Publish New Panel'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-2">
            {(['metadata', 'nxml', 'preview', 'publish'] as Step[]).map((s, index) => (
              <React.Fragment key={s}>
                <button
                  onClick={() => setStep(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                    step === s
                      ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                      : index < ['metadata', 'nxml', 'preview', 'publish'].indexOf(step)
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-zinc-500'
                  }`}
                >
                  {index + 1}. {s}
                </button>
                {index < 3 && <div className="flex-1 h-px bg-white/10" />}
              </React.Fragment>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400 mb-1">Validation Errors</p>
                    <ul className="text-xs text-red-300 space-y-0.5">
                      {validationErrors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Metadata */}
            {step === 'metadata' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Panel Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Panel"
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what your panel does..."
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white focus:outline-none focus:border-violet-500/50"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Icon (Emoji)
                    </label>
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="📦"
                      maxLength={2}
                      className="w-full px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Accent Color
                  </label>
                  <div className="flex gap-2">
                    {ACCENT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setAccentColor(color.value)}
                        className={`w-10 h-10 rounded-lg ${color.class} transition-all ${
                          accentColor === color.value
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                            : 'opacity-50 hover:opacity-100'
                        }`}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="productivity, notes, markdown"
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              </div>
            )}

            {/* Step: NXML */}
            {step === 'nxml' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-300">
                    <p className="font-medium mb-1">NXML Guidelines</p>
                    <ul className="space-y-0.5">
                      <li>• Must include &lt;NexusPanel&gt;, &lt;Data&gt;, and &lt;View&gt; sections</li>
                      <li>• &lt;Logic&gt; section is optional but recommended</li>
                      <li>• Use proper XML syntax with closing tags</li>
                      <li>• Test your NXML thoroughly before publishing</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    NXML Source *
                  </label>
                  <textarea
                    value={nxmlSource}
                    onChange={(e) => setNxmlSource(e.target.value)}
                    rows={20}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-900/50 border border-white/5 text-white font-mono text-xs focus:outline-none focus:border-violet-500/50 resize-none"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            {/* Step: Preview */}
            {step === 'preview' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-800/50 border border-white/5 p-4">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-16 h-16 rounded-lg bg-${accentColor}-500/20 border border-${accentColor}-500/30 flex items-center justify-center text-3xl`}>
                      {icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>
                      <p className="text-sm text-zinc-400 mb-2">{description}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-xs capitalize">
                          {category}
                        </span>
                        {tags.split(',').filter(Boolean).map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-400 text-xs">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Code size={14} className="text-zinc-500" />
                      <span className="text-xs font-medium text-zinc-400">NXML Source Preview</span>
                    </div>
                    <pre className="text-xs text-zinc-400 bg-black/20 rounded p-3 overflow-auto max-h-48">
                      {nxmlSource.slice(0, 500)}
                      {nxmlSource.length > 500 && '\n...'}
                    </pre>
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-300">
                    <p className="font-medium mb-1">Ready to Publish</p>
                    <p className="text-emerald-400/80">
                      Your panel looks good! Click Next to choose publishing options.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Publish */}
            {step === 'publish' && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <Upload size={48} className="text-violet-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Choose Publishing Option
                  </h3>
                  <p className="text-sm text-zinc-400 mb-6">
                    You can publish as a draft to test it first, or publish directly to the marketplace
                  </p>

                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <button
                      onClick={() => handlePublish('draft')}
                      disabled={isPublishing}
                      className="p-4 rounded-lg bg-zinc-800/50 border border-white/5 hover:bg-zinc-800/70 transition-colors disabled:opacity-50"
                    >
                      <Save size={24} className="text-amber-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-white mb-1">Save as Draft</p>
                      <p className="text-xs text-zinc-500">Test before publishing</p>
                    </button>

                    <button
                      onClick={() => handlePublish('published')}
                      disabled={isPublishing}
                      className="p-4 rounded-lg bg-violet-500/20 border border-violet-500/30 hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                    >
                      <Upload size={24} className="text-violet-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-white mb-1">Publish Now</p>
                      <p className="text-xs text-zinc-500">Make it available to everyone</p>
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <p className="text-sm text-red-400">{error.message}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={() => {
                const steps: Step[] = ['metadata', 'nxml', 'preview', 'publish'];
                const currentIndex = steps.indexOf(step);
                if (currentIndex > 0) {
                  setStep(steps[currentIndex - 1]);
                }
              }}
              disabled={step === 'metadata'}
              className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>

            {step !== 'publish' && (
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white font-medium transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
