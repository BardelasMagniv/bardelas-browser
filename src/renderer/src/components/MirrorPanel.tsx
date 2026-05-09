import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, WheelEvent } from 'react';
import type { MirrorConfig, MirrorInputEvent } from '@shared/types';

const COUNTRY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'BR', label: 'Brazil' },
  { code: 'IN', label: 'India' },
  { code: 'JP', label: 'Japan' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
];

const MAX_MIRRORS = 10;

type MirrorPanelProps = {
  profileId?: string;
  active: boolean;
  onMirrorStatusChange?: (state: { active: boolean; count: number }) => void;
};

function randomCountry() {
  return COUNTRY_OPTIONS[Math.floor(Math.random() * COUNTRY_OPTIONS.length)].code;
}

export function MirrorPanel({ profileId, active, onMirrorStatusChange }: MirrorPanelProps) {
  const [count, setCount] = useState(2);
  const [configs, setConfigs] = useState<MirrorConfig[]>(() =>
    Array.from({ length: 2 }, (_, index) => ({ id: `mirror-${index + 1}`, country: 'US', useRandomIdentity: false }))
  );
  const [randomizeLocations, setRandomizeLocations] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotMessage, setScreenshotMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [launchMessage, setLaunchMessage] = useState('');
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [streamFrames, setStreamFrames] = useState<Array<{ id: string; image: string }>>([]);
  const [streamMessage, setStreamMessage] = useState('');
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);

  const expandedFrame = useMemo(() => {
    if (!expandedFrameId) {
      return null;
    }
    return streamFrames.find((frame) => frame.id === expandedFrameId) ?? null;
  }, [expandedFrameId, streamFrames]);

  useEffect(() => {
    setConfigs((current) => {
      const next = current.slice(0, count);
      while (next.length < count) {
        next.push({ id: `mirror-${next.length + 1}`, country: 'US', useRandomIdentity: false });
      }
      return next;
    });
  }, [count]);

  const canStart = Boolean(profileId) && active;

  const summary = useMemo(() => {
    if (randomizeLocations) {
      return `${count} mirror${count === 1 ? '' : 's'} with random locations`;
    }
    return configs.slice(0, count).map((config) => `${config.country}${config.useRandomIdentity ? ' (rand)' : ''}`).join(', ');
  }, [count, configs, randomizeLocations]);

  async function sendPreviewInput(frameId: string, event: MirrorInputEvent) {
    try {
      await window.api.mirror.sendEvent(frameId, event);
    } catch (error) {
      console.error('Mirror preview interaction failed:', error);
    }
  }

  function getPreviewCoordinates(event: MouseEvent | WheelEvent) {
    const image = previewImageRef.current;
    if (!image) {
      return null;
    }

    const rect = image.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * image.naturalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * image.naturalHeight;

    return { x: Math.round(Math.max(0, Math.min(image.naturalWidth, x))), y: Math.round(Math.max(0, Math.min(image.naturalHeight, y))) };
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (!expandedFrameId) {
      return;
    }
    const coords = getPreviewCoordinates(event);
    if (!coords) {
      return;
    }
    sendPreviewInput(expandedFrameId, {
      type: 'click',
      x: coords.x,
      y: coords.y,
      button: event.button,
    });
  }

  function handlePreviewContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!expandedFrameId) {
      return;
    }
    event.preventDefault();
    const coords = getPreviewCoordinates(event);
    if (!coords) {
      return;
    }
    sendPreviewInput(expandedFrameId, {
      type: 'click',
      x: coords.x,
      y: coords.y,
      button: 2,
    });
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    if (!expandedFrameId) {
      return;
    }
    event.preventDefault();
    const coords = getPreviewCoordinates(event);
    if (!coords) {
      return;
    }
    sendPreviewInput(expandedFrameId, {
      type: 'scroll',
      x: coords.x,
      y: coords.y,
      deltaY: event.deltaY,
    });
  }

  function handlePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!expandedFrameId) {
      return;
    }
    event.preventDefault();
    sendPreviewInput(expandedFrameId, { type: 'keydown', key: event.key });
  }

  function handlePreviewKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    if (!expandedFrameId) {
      return;
    }
    event.preventDefault();
    sendPreviewInput(expandedFrameId, { type: 'keyup', key: event.key });
  }

  function updateConfig(index: number, next: Partial<MirrorConfig>) {
    setConfigs((current) => current.map((config, idx) => (idx === index ? { ...config, ...next } : config)));
  }

  const isStarting = launchStatus === 'starting';

  async function handleStart() {
    if (!profileId) {
      return;
    }

    const startupConfigs = configs.slice(0, count).map((config) => ({
      ...config,
      country: randomizeLocations ? randomCountry() : config.country,
    }));

    setLaunchStatus('starting');
    setLaunchMessage(`Launching ${count} mirror${count === 1 ? '' : 's'}...`);

    try {
      await window.api.mirror.start(profileId, startupConfigs);
      setIsRunning(true);
      setLaunchStatus('running');
      setLaunchMessage(`Successfully launched ${count} mirror${count === 1 ? '' : 's'}.`);
    } catch (error: any) {
      setIsRunning(false);
      setLaunchStatus('error');
      setLaunchMessage(error?.message || 'Failed to launch mirrors.');
    }
  }

  async function handleStop() {
    await window.api.mirror.stop();
    setIsRunning(false);
    setStreamEnabled(false);
    setStreamFrames([]);
    setLaunchStatus('idle');
    setLaunchMessage('Mirrors stopped.');
  }

  useEffect(() => {
    onMirrorStatusChange?.({ active: isRunning, count: isRunning ? count : 0 });
  }, [count, isRunning, onMirrorStatusChange]);

  useEffect(() => {
    if (!canStart) {
      setIsRunning(false);
      setStreamEnabled(false);
      setStreamFrames([]);
    }
  }, [canStart]);

  useEffect(() => {
    window.api.mirror.onStream((frames) => {
      setStreamFrames(frames.filter((frame) => frame.image));
    });
  }, []);

  useEffect(() => {
    if (expandedFrameId && previewPanelRef.current) {
      previewPanelRef.current.focus();
    }
  }, [expandedFrameId]);

  useEffect(() => {
    if (!isRunning && streamEnabled) {
      setStreamEnabled(false);
      setStreamMessage('');
      return;
    }

    if (streamEnabled) {
      setStreamMessage('');
      window.api.mirror.stream(true).catch((error) => {
        setStreamMessage('Live mirror streaming failed.');
        console.error(error);
        setStreamEnabled(false);
      });
    } else {
      setStreamMessage('');
      window.api.mirror.stream(false).catch(() => {});
      setStreamFrames([]);
    }
  }, [streamEnabled, isRunning]);

  async function handleScreenshot() {
    const images = await window.api.mirror.screenshot();
    setScreenshots(images);
    setScreenshotMessage('Screenshots captured and the screenshots folder has been opened.');
  }

  return (
    <div className="card">
      <div className="header-row">
        <div>
          <h3 className="title">Action Mirror</h3>
          <p className="subtitle">Launch headless mirrors that follow your main browser activity.</p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">Mirror browser count</label>
        <input
          className="input-field"
          type="range"
          min={1}
          max={MAX_MIRRORS}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <div>{count} mirror{count === 1 ? '' : 's'}</div>
      </div>

      <div className="input-group">
        <label className="input-label">
          <input
            type="checkbox"
            checked={randomizeLocations}
            onChange={(event) => setRandomizeLocations(event.target.checked)}
          />{' '}
          Randomize location for all mirrors
        </label>
      </div>

      <div className="card" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
        {configs.slice(0, count).map((config, index) => (
          <div key={config.id} className="input-group">
            <label className="input-label">Mirror {index + 1} country</label>
            <select
              className="select-field"
              value={config.country}
              disabled={randomizeLocations}
              onChange={(event) => updateConfig(index, { country: event.target.value })}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="input-label">
              <input
                type="checkbox"
                checked={config.useRandomIdentity}
                onChange={(event) => updateConfig(index, { useRandomIdentity: event.target.checked })}
              />{' '}
              Use random identity
            </label>
          </div>
        ))}
      </div>

      <div className="input-group">
        <label className="input-label">
          <input
            type="checkbox"
            checked={streamEnabled}
            disabled={!isRunning}
            onChange={(event) => setStreamEnabled(event.target.checked)}
          />{' '}
          Live mirror screen stream
        </label>
        {streamEnabled ? (
          <div style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
            Streaming mirror screens to the launcher...
          </div>
        ) : null}
        {streamMessage ? (
          <div style={{ marginTop: '0.5rem', color: '#f87171' }}>{streamMessage}</div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button className="button-secondary" onClick={handleStart} disabled={!canStart || isRunning || isStarting}>
          {isStarting ? 'Starting...' : 'Start mirrors'}
        </button>
        <button className="button-secondary" onClick={handleStop} disabled={!isRunning || isStarting}>
          Stop mirrors
        </button>
        <button className="button-secondary" onClick={handleScreenshot} disabled={!isRunning}>
          Capture screenshots
        </button>
      </div>

      <div style={{ marginTop: '1rem', color: '#94a3b8' }}>
        {canStart ? `Ready with ${summary}` : 'Launch a profile first to enable mirrors.'}
      </div>

      {screenshotMessage ? (
        <div style={{ marginTop: '0.75rem', color: '#a3e635' }}>{screenshotMessage}</div>
      ) : null}

      {streamEnabled ? (
        <div style={{ marginTop: '1rem' }}>
          {streamFrames.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {streamFrames.map((frame) => (
                <div
                  key={frame.id}
                  className="screenshot-card screenshot-card--clickable"
                  onClick={() => setExpandedFrameId(frame.id)}
                >
                  <img
                    src={`data:image/jpeg;base64,${frame.image}`}
                    alt={`Mirror live ${frame.id}`}
                    style={{ width: '100%', display: 'block', cursor: 'pointer' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', color: '#f8bd09' }}>
              Waiting for live mirror frame data...
            </div>
          )}
        </div>
      ) : null}

      <div className={`status-chip ${launchStatus}`}>
        {launchStatus === 'starting' && 'Starting mirrors...'}
        {launchStatus === 'running' && launchMessage}
        {launchStatus === 'error' && launchMessage}
        {launchStatus === 'idle' && launchMessage && launchMessage}
      </div>

      {expandedFrameId ? (
        <div className="live-preview-overlay" onClick={() => setExpandedFrameId(null)}>
          <div
            className="live-preview-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handlePreviewKeyDown}
            onKeyUp={handlePreviewKeyUp}
            tabIndex={0}
            ref={previewPanelRef}
          >
            <button className="live-preview-close" onClick={() => setExpandedFrameId(null)}>
              ×
            </button>
            {expandedFrame ? (
              <>
                <div style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>
                  Live preview for <strong>{expandedFrame.id}</strong>
                </div>
                <div style={{ position: 'relative' }}>
                  <div style={{ marginBottom: '0.75rem', color: '#94a3b8' }}>
                    Click inside the preview to interact, type to send keyboard input, or scroll to move the page.
                  </div>
                  <div
                    className="live-preview-interaction"
                    onClick={handlePreviewClick}
                    onContextMenu={handlePreviewContextMenu}
                    onWheel={handlePreviewWheel}
                    style={{ cursor: 'crosshair' }}
                  >
                    <img
                      ref={previewImageRef}
                      src={`data:image/jpeg;base64,${expandedFrame.image}`}
                      alt={`Expanded mirror live ${expandedFrame.id}`}
                      style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#cbd5e1' }}>
                Waiting for live preview data for the selected mirror...
              </div>
            )}
          </div>
        </div>
      ) : null}

      {screenshots.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {screenshots.map((image, index) => (
              <div key={image} className="screenshot-card">
                <img src={`data:image/jpeg;base64,${image}`} alt={`Mirror screenshot ${index + 1}`} style={{ width: '100%', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
