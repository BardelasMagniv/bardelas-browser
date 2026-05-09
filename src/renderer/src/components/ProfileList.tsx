import type { Profile } from '@shared/types';

type ProfileListProps = {
  profiles: Profile[];
  selectedProfileId?: string;
  runningStatuses: Record<string, boolean>;
  onRefresh: () => Promise<void>;
  onSelect: (id: string) => void;
  onLaunch: (profile: Profile) => Promise<void>;
  onStop: (profile: Profile) => Promise<void>;
  onDelete: (profile: Profile) => Promise<void>;
};

export function ProfileList({
  profiles,
  selectedProfileId,
  runningStatuses,
  onRefresh,
  onSelect,
  onLaunch,
  onStop,
  onDelete,
}: ProfileListProps) {
  if (profiles.length === 0) {
    return <div className="map-stub">No profiles found. Click + to create one.</div>;
  }

  return (
    <div>
      {profiles.map((profile) => {
        const isSelected = profile.id === selectedProfileId;
        const isRunning = runningStatuses[profile.id] ?? false;
        return (
          <div
            key={profile.id}
            className="card"
            style={{
              borderColor: isSelected ? '#2563eb' : 'rgba(148, 163, 184, 0.14)',
              cursor: 'pointer',
            }}
            onClick={() => onSelect(profile.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{profile.name}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.35rem' }}>
                  {profile.type.toUpperCase()} • {profile.country} • {isRunning ? 'Active' : 'Stopped'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {isRunning ? (
                  <button className="button-secondary" onClick={(event) => { event.stopPropagation(); onStop(profile); }}>
                    Stop
                  </button>
                ) : (
                  <button className="button-secondary" onClick={(event) => { event.stopPropagation(); onLaunch(profile); }}>
                    Launch
                  </button>
                )}
                <button className="button-secondary" onClick={(event) => { event.stopPropagation(); onDelete(profile); }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
