import { useEffect, useState } from 'react';
import type { Profile } from '@shared/types';

type ProfileEditorProps = {
  profile?: Profile;
  selectedCountry: string;
  onCountryChange?: (country: string) => void;
  onCreateProfile: () => void;
  onOpenSettings: () => void;
  onSave: (profile: Profile) => Promise<void>;
  onLaunch: (profile: Profile) => Promise<void>;
  onLoad: () => Promise<void>;
  isNew?: boolean;
};

export function ProfileEditor({
  profile,
  selectedCountry,
  onCountryChange,
  onCreateProfile,
  onOpenSettings,
  onSave,
  onLaunch,
  onLoad,
  isNew,
}: ProfileEditorProps) {
  const [draft, setDraft] = useState<Profile | null>(null);

  useEffect(() => {
    if (profile) {
      setDraft({ ...profile, fingerprintBrand: 'Chrome', browserLanguage: profile.browserLanguage ?? 'en-US' });
    } else {
      setDraft(null);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile && draft) {
      setDraft({ ...draft, country: selectedCountry, browserLanguage: draft.browserLanguage ?? 'en-US' });
    }
  }, [selectedCountry, profile, draft]);

  function updateField<K extends keyof Profile>(key: K, value: Profile[K]) {
    if (key === 'country' && typeof value === 'string') {
      onCountryChange?.(value);
    }
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleArgsChange(value: string) {
    const items = value.split('\n').map((item) => item.trim()).filter(Boolean);
    setDraft((current) => ({ ...current, extraArgs: items }));
  }

  if (!draft) {
    return (
      <div className="card">
        <h3 className="title">No profile selected</h3>
        <p className="subtitle">Create a new profile or select one from the list to configure launch details.</p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="button-primary" onClick={onCreateProfile}>
            New profile
          </button>
          <button className="button-secondary" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>{isNew ? 'Create profile' : 'Profile details'}</h3>
          <p className="subtitle">Configure launch settings, fingerprint values, and mirror behavior.</p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">Name</label>
        <input
          className="input-field"
          value={draft.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="Profile name"
        />
      </div>

      <div className="grid-two">
        <div className="input-group">
          <label className="input-label">Country</label>
          <input
            className="input-field"
            value={draft.country}
            onChange={(event) => updateField('country', event.target.value.toUpperCase())}
          />
        </div>
        <div className="input-group">
          <label className="input-label">Session type</label>
          <select
            className="select-field"
            value={draft.type}
            onChange={(event) => updateField('type', event.target.value as Profile['type'])}
          >
            <option value="persistent">Persistent</option>
            <option value="incognito">Incognito</option>
          </select>
        </div>
      </div>

      <div className="grid-two">
        <div className="input-group">
          <label className="input-label">Fingerprint platform</label>
          <select
            className="select-field"
            value={draft.fingerprintPlatform}
            onChange={(event) => updateField('fingerprintPlatform', event.target.value)}
          >
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Browser type</label>
          <input className="input-field" value="Chrome" disabled />
        </div>
      </div>

      <div className="grid-two">
        <div className="input-group">
          <label className="input-label">Browser language</label>
          <input
            className="input-field"
            value={draft.browserLanguage ?? ''}
            onChange={(event) => updateField('browserLanguage', event.target.value)}
            placeholder="en-US"
          />
        </div>
      </div>

      <div className="grid-two">
        <div className="input-group">
          <label className="input-label">Screen width</label>
          <input
            className="input-field"
            value={draft.fingerprintScreenWidth ?? ''}
            type="number"
            onChange={(event) => updateField('fingerprintScreenWidth', Number(event.target.value))}
          />
        </div>
        <div className="input-group">
          <label className="input-label">Screen height</label>
          <input
            className="input-field"
            value={draft.fingerprintScreenHeight ?? ''}
            type="number"
            onChange={(event) => updateField('fingerprintScreenHeight', Number(event.target.value))}
          />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">Extra launch args</label>
        <textarea
          className="input-field"
          rows={4}
          value={(draft.extraArgs ?? []).join('\n')}
          onChange={(event) => handleArgsChange(event.target.value)}
          placeholder="One Chrome arg per line"
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button className="button-secondary" onClick={onOpenSettings}>
          Settings
        </button>
        <button
          className="button-secondary"
          onClick={async () => {
            try {
              await onSave({
                ...draft,
                fingerprintBrand: 'Chrome',
                country: draft.country.toUpperCase(),
                createdAt: draft.createdAt || Date.now(),
              });
            } catch (err) {
              console.error('Save profile failed', err);
            }
          }}
        >
          {isNew ? 'Create profile' : 'Save profile'}
        </button>
        <button
          className="button-secondary"
          onClick={async () => {
            if (draft) {
              await onLaunch(draft);
            }
          }}
        >
          Launch
        </button>
        <button className="button-secondary" onClick={onLoad}>
          Load profile
        </button>
      </div>
    </div>
  );
}
