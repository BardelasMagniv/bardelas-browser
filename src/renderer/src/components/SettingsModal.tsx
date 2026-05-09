import { useEffect, useState } from 'react';
import type { SettingsPayload } from '@shared/types';

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<SettingsPayload>({
    evomiApiKey: '',
    mirrorMode: 'default',
    geoSpoofMode: 'custom',
    aiOllamaHost: '127.0.0.1',
    aiOllamaPort: 11434,
    aiModelName: 'llama2',
    aiOcrEnabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.api.settings.get()
      .then((loaded) => {
        const nextSettings = {
          evomiApiKey: loaded.evomiApiKey || '',
          mirrorMode: loaded.mirrorMode || 'default',
          geoSpoofMode: loaded.geoSpoofMode || 'custom',
          aiOllamaHost: loaded.aiOllamaHost || '127.0.0.1',
          aiOllamaPort: loaded.aiOllamaPort ?? 11434,
          aiModelName: loaded.aiModelName || 'llama2',
          aiOcrEnabled: loaded.aiOcrEnabled ?? false,
        };
        setSettings(nextSettings);
        loadModelOptions(nextSettings.aiOllamaHost, nextSettings.aiOllamaPort, nextSettings.aiModelName);
      })
      .catch((error) => {
        console.error(error);
        setModelError('Unable to load Ollama settings or models.');
      });
  }, [open]);

  async function loadModelOptions(host: string, port: number, currentModelName?: string) {
    setLoadingModels(true);
    setModelError(null);
    try {
      const models = await window.api.ai.listModels({
        ollamaHost: host,
        ollamaPort: port,
      });
      setInstalledModels(models);
      const selectedModel = currentModelName || settings.aiModelName || '';
      if (!models.includes(selectedModel)) {
        setSettings((current) => ({ ...current, aiModelName: models[0] ?? current.aiModelName }));
      }
    } catch (error: any) {
      setInstalledModels([]);
      setModelError(error?.message || 'Failed to load Ollama models.');
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    await window.api.settings.set(settings);
    setSaving(false);
    onClose();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel panel">
        <div className="header-row">
          <div>
            <h2 className="title">Settings</h2>
            <p className="subtitle">Set your Evomi API key for proxy generation.</p>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Evomi API key</label>
          <input
            className="input-field"
            value={settings.evomiApiKey}
            onChange={(event) => setSettings({ ...settings, evomiApiKey: event.target.value })}
            placeholder="Enter your Evomi API key"
          />
        </div>

        <div className="input-group">
          <label className="input-label">Mirror control mode</label>
          <select
            className="input-field"
            value={settings.mirrorMode}
            onChange={(event) => setSettings({ ...settings, mirrorMode: event.target.value as 'default' | 'playwright' })}
          >
            <option value="default">Default (script-driven mirror control)</option>
            <option value="playwright">Playwright (native Playwright mirror control)</option>
          </select>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>
            Opt in to the Playwright mirror mechanism. Default mode keeps current script mirroring behavior.
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">Geo spoofing mode</label>
          <select
            className="input-field"
            value={settings.geoSpoofMode}
            onChange={(event) => setSettings({ ...settings, geoSpoofMode: event.target.value as 'cloakbrowser' | 'custom' })}
          >
            <option value="custom">Custom manual geo spoofing</option>
            <option value="cloakbrowser">CloakBrowser built-in geo-spoofing</option>
          </select>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>
            Choose whether location spoofing is handled by CloakBrowser's built-in geoip feature or by the app's custom proxy geolocation override.
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">Local Ollama host</label>
          <input
            className="input-field"
            value={settings.aiOllamaHost ?? ''}
            onChange={(event) => setSettings({ ...settings, aiOllamaHost: event.target.value })}
            placeholder="127.0.0.1"
          />
        </div>

        <div className="input-group">
          <label className="input-label">Local Ollama port</label>
          <input
            className="input-field"
            type="number"
            value={settings.aiOllamaPort ?? 11434}
            onChange={(event) => setSettings({ ...settings, aiOllamaPort: Number(event.target.value) })}
            placeholder="11434"
          />
        </div>

        <div className="input-group">
          <label className="input-label">AI model</label>
          {installedModels.length > 0 ? (
            <select
              className="input-field"
              value={settings.aiModelName ?? ''}
              onChange={(event) => setSettings({ ...settings, aiModelName: event.target.value })}
            >
              {installedModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input-field"
              value={settings.aiModelName ?? ''}
              onChange={(event) => setSettings({ ...settings, aiModelName: event.target.value })}
              placeholder="llama2"
            />
          )}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="button-secondary"
              type="button"
              onClick={() => loadModelOptions(settings.aiOllamaHost ?? '127.0.0.1', settings.aiOllamaPort ?? 11434)}
              disabled={loadingModels}
            >
              {loadingModels ? 'Refreshing...' : 'Refresh models'}
            </button>
            {modelError ? <span style={{ color: '#f87171' }}>{modelError}</span> : null}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">
            <input
              type="checkbox"
              checked={settings.aiOcrEnabled ?? false}
              onChange={(event) => setSettings({ ...settings, aiOcrEnabled: event.target.checked })}
            />{' '}
            Enable OCR fallback
          </label>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>
            Use OCR if DOM text extraction fails. This requires a compatible OCR engine in the future.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" onClick={handleSave} disabled={saving}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
