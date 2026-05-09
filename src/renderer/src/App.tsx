import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Profile } from '@shared/types';
import { WorldMap } from './components/WorldMap/WorldMap';
import { ProfileList } from './components/ProfileList';
import { ProfileEditor } from './components/ProfileEditor';
import { SettingsModal } from './components/SettingsModal';
import { MirrorPanel } from './components/MirrorPanel';
import { AiAgentPanel } from './components/AiAgentPanel';

type ContextMenuState = {
  x: number;
  y: number;
  profileId: string;
};

function createDefaultProfile(country: string): Profile {
  return {
    id: uuidv4(),
    name: `${country} Profile`,
    type: 'persistent',
    country,
    browserLanguage: country === 'FR' ? 'fr-FR' : 'en-US',
    createdAt: Date.now(),
    fingerprintSeed: Math.floor(Math.random() * 90000) + 10000,
    fingerprintPlatform: 'windows',
    fingerprintHardwareConcurrency: 8,
    fingerprintDeviceMemory: 8,
    fingerprintScreenWidth: 1920,
    fingerprintScreenHeight: 1080,
    fingerprintBrand: 'Chrome',
    extraArgs: [],
  };
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('US');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>();
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [runningStatuses, setRunningStatuses] = useState<Record<string, boolean>>({});
  const [mirrorState, setMirrorState] = useState({ active: false, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingRotateProfileId, setPendingRotateProfileId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const activeProfile = editingProfile ?? selectedProfile;
  const isNewProfile = Boolean(editingProfile && !profiles.some((profile) => profile.id === editingProfile.id));

  const pendingRotateProfile = useMemo(
    () => profiles.find((profile) => profile.id === pendingRotateProfileId) ?? null,
    [profiles, pendingRotateProfileId]
  );

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => runningStatuses[profile.id]),
    [profiles, runningStatuses]
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleMirrorStatusChange = useCallback((state: { active: boolean; count: number }) => {
    setMirrorState(state);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (selectedProfileId && selectedProfile) {
      setEditingProfile(selectedProfile);
    }
  }, [selectedProfileId, selectedProfile]);

  useEffect(() => {
    if (editingProfile) {
      setSelectedCountry(editingProfile.country);
    } else if (selectedProfile) {
      setSelectedCountry(selectedProfile.country);
    }
  }, [editingProfile, selectedProfile]);

  async function loadProfiles(preferredSelectedId?: string) {
    setLoading(true);
    setError(null);
    try {
      const list = await window.api.profiles.list();
      setProfiles(list);
      if (list.length > 0) {
        const selectedId = preferredSelectedId ?? selectedProfileId;
        const selectedStillValid = selectedId && list.some((profile) => profile.id === selectedId);
        if (!selectedStillValid) {
          setSelectedProfileId(list[0].id);
        }
      } else {
        setSelectedProfileId(undefined);
      }
      await loadRunningStatuses(list);
    } catch (err) {
      console.error('Failed to load profiles', err);
      setError('Unable to load profiles. Please restart the app or try again.');
      setProfiles([]);
      setSelectedProfileId(undefined);
      setRunningStatuses({});
    } finally {
      setLoading(false);
    }
  }

  async function loadRunningStatuses(list: Profile[]) {
    try {
      const statuses = await Promise.all(
        list.map(async (profile) => ({
          id: profile.id,
          running: await window.api.browser.isRunning(profile.id),
        }))
      );
      setRunningStatuses(Object.fromEntries(statuses.map((entry) => [entry.id, entry.running])));
    } catch (err) {
      console.error('Failed to load browser running statuses', err);
      setRunningStatuses({});
    }
  }

  function handleCreateProfile() {
    setSelectedProfileId(undefined);
    setEditingProfile(createDefaultProfile(selectedCountry));
  }

  async function handleCountryChange(country: string) {
    if (pendingRotateProfileId) {
      await handleRotateIpToCountry(pendingRotateProfileId, country);
      return;
    }

    setSelectedCountry(country);
    setEditingProfile((current) => {
      if (current) {
        return { ...current, country };
      }
      if (selectedProfile) {
        return { ...selectedProfile, country };
      }
      return current;
    });
  }

  async function handleRestart(profile: Profile) {
    setContextMenu(null);
    try {
      await window.api.profiles.stop(profile.id);
      await window.api.profiles.launch(profile.id);
      await loadProfiles(profile.id);
    } catch (error) {
      console.error('Failed to restart browser', error);
      setError('Unable to restart browser. Check the console for details.');
    }
  }

  function handleBrowserChipContextMenu(event: MouseEvent<HTMLDivElement>, profileId: string) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, profileId });
  }

  function handleRotateIp(profileId: string) {
    setContextMenu(null);
    setPendingRotateProfileId(profileId);
  }

  async function handleRotateIpToCountry(profileId: string, country: string) {
    setPendingRotateProfileId(null);
    setSelectedCountry(country);
    try {
      await window.api.profiles.rotateIp(profileId, country);
      await loadProfiles(profileId);
    } catch (error) {
      console.error('Failed to rotate IP', error);
      setError('Unable to rotate IP. Check the console for details.');
    }
  }

  async function handleLaunch(profile: Profile) {
    setError(null);

    try {
      const profileToSave: Profile = {
        ...profile,
        country: profile.country.toUpperCase(),
        createdAt: profile.createdAt || Date.now(),
        fingerprintBrand: profile.fingerprintBrand || 'Chrome',
        fingerprintPlatform: profile.fingerprintPlatform || 'windows',
        browserLanguage: profile.browserLanguage || 'en-US',
        fingerprintSeed: profile.fingerprintSeed || Math.floor(Math.random() * 90000) + 10000,
        extraArgs: profile.extraArgs ?? [],
      };

      const existingProfile = profiles.find((item) => item.id === profile.id);
      const savedProfile = existingProfile
        ? await window.api.profiles.update(profileToSave)
        : await window.api.profiles.create(profileToSave);

      await window.api.profiles.launch(savedProfile.id);
      setSelectedProfileId(savedProfile.id);
      setEditingProfile(savedProfile);
      await loadProfiles(savedProfile.id);
    } catch (error) {
      console.error('Failed to launch browser', error);
      setError('Unable to launch browser. Check the console for details.');
    }
  }

  async function handleStop(profile: Profile) {
    setContextMenu(null);
    await window.api.profiles.stop(profile.id);
    await loadProfiles();
  }

  async function handleDelete(profile: Profile) {
    if (profile.id === selectedProfileId) {
      setSelectedProfileId(undefined);
    }
    if (editingProfile?.id === profile.id) {
      setEditingProfile(null);
    }
    await window.api.profiles.delete(profile.id);
    await loadProfiles();
  }

  async function handleSaveProfile(profile: Profile) {
    const profileToSave = { ...profile, country: profile.country.toUpperCase() };
    setError(null);
    try {
      const savedProfile = await window.api.profiles.save(profileToSave);
      setSelectedProfileId(savedProfile.id);
      setEditingProfile(savedProfile);
      await loadProfiles(savedProfile.id);
      return savedProfile;
    } catch (error) {
      console.error('Failed to save profile', error);
      setError('Unable to save profile. Check the console for details.');
      throw error;
    }
  }

  async function handleLoadProfile() {
    setError(null);
    try {
      const loadedProfile = await window.api.profiles.load();
      if (!loadedProfile) {
        return;
      }
      setEditingProfile(loadedProfile);
      setSelectedProfileId(loadedProfile.id);
      await loadProfiles(loadedProfile.id);
    } catch (error) {
      console.error('Failed to load profile', error);
      setError('Unable to load profile. Check the console for details.');
    }
  }

  return (
    <div className="app-shell">
      <section className="panel world-map-shell">
        <div className="header-row map-header-row">
          <div>
            <h1 className="title">Bardelas</h1>
            <p className="subtitle">Enterprise-grade profile management with live region selection and mirrored action control.</p>
          </div>
        </div>

        <div className="map-card">
          {pendingRotateProfile ? (
            <div className="map-rotation-banner">
              Click a location on the map to rotate IP for <strong>{pendingRotateProfile.name}</strong>. Press Esc to cancel.
            </div>
          ) : null}
          <WorldMap selectedCountry={selectedCountry} onCountrySelect={handleCountryChange} />
        </div>

        <div className="active-browser-bar">
          <div className="active-browser-bar-title">Active browsers</div>
          <div className="active-browser-chip-list">
            {activeProfiles.length > 0 ? (
              activeProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="browser-chip browser-chip--main"
                  onContextMenu={(event) => handleBrowserChipContextMenu(event, profile.id)}
                >
                  <strong>{profile.name}</strong>
                  <span>Main browser</span>
                </div>
              ))
            ) : (
              <div className="browser-chip browser-chip--empty">No active main browser sessions</div>
            )}

            {mirrorState.active ? (
              <div className="browser-chip browser-chip--mirror">
                <strong>{mirrorState.count} mirror{mirrorState.count === 1 ? '' : 's'}</strong>
                <span>Mirror browser{mirrorState.count === 1 ? '' : 's'}</span>
              </div>
            ) : null}
          </div>
          {contextMenu ? (
            <div
              ref={contextMenuRef}
              className="browser-context-menu"
              style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, transform: 'translateY(-100%)', zIndex: 1000 }}
            >
              <button
                type="button"
                onClick={() => {
                  const profile = profiles.find((profile) => profile.id === contextMenu.profileId);
                  if (profile) {
                    void handleStop(profile);
                  }
                }}
              >
                Terminate browser
              </button>
              <button type="button" onClick={() => handleRotateIp(contextMenu.profileId)}>
                Rotate IP
              </button>
              <button
                type="button"
                onClick={() => {
                  const profile = profiles.find((profile) => profile.id === contextMenu.profileId);
                  if (profile) {
                    void handleRestart(profile);
                  }
                }}
              >
                Restart browser
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel panel-stack">
        <div className="header-row">
          <div>
            <h2 className="title">Profiles</h2>
            <p className="subtitle">Manage persistent and incognito sessions with proxy profiles.</p>
          </div>
        </div>

        <div className="panel-stack-content">
          {loading ? (
            <div className="map-stub">Loading profiles...</div>
          ) : (
            <>
              {error ? (
                <div style={{ padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '0.75rem', marginBottom: '1rem' }}>
                  {error}
                </div>
              ) : null}
              <div className="profile-list-scroll">
                <ProfileList
                  profiles={profiles}
                  selectedProfileId={selectedProfile?.id}
                  runningStatuses={runningStatuses}
                  onRefresh={loadProfiles}
                  onSelect={setSelectedProfileId}
                  onLaunch={handleLaunch}
                  onStop={handleStop}
                  onDelete={handleDelete}
                />
              </div>
            </>
          )}

          <ProfileEditor
            profile={activeProfile}
            selectedCountry={selectedCountry}
            onCountryChange={handleCountryChange}
            onCreateProfile={handleCreateProfile}
            onOpenSettings={() => setSettingsOpen(true)}
            onSave={handleSaveProfile}
            onLaunch={handleLaunch}
            onLoad={handleLoadProfile}
            isNew={isNewProfile}
          />

          <MirrorPanel
            profileId={selectedProfile?.id}
            active={Boolean(selectedProfile && runningStatuses[selectedProfile.id])}
            onMirrorStatusChange={handleMirrorStatusChange}
          />

          <AiAgentPanel
            profileId={selectedProfile?.id}
            active={Boolean(selectedProfile && runningStatuses[selectedProfile.id])}
          />
        </div>
      </section>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
