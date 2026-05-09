import { useEffect, useMemo, useState } from 'react';
import type { AiAgentResponse, AiAgentSession } from '@shared/types';

type AiAgentPanelProps = {
  profileId?: string;
  active: boolean;
};

export function AiAgentPanel({ profileId, active }: AiAgentPanelProps) {
  const [session, setSession] = useState<AiAgentSession | null>(null);
  const [instruction, setInstruction] = useState('');
  const [statusMessage, setStatusMessage] = useState('No AI session started.');
  const [messages, setMessages] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const canStart = Boolean(profileId && active && !session);

  useEffect(() => {
    if (!profileId) {
      setSession(null);
      setStatusMessage('Select and launch a profile to use the AI agent.');
    }
  }, [profileId]);

  const sessionLabel = useMemo(() => {
    if (!session) {
      return 'Inactive';
    }
    return `${session.status === 'running' ? 'Running' : 'Idle'} (session ${session.id.slice(0, 8)})`;
  }, [session]);

  async function handleStartSession() {
    if (!profileId) {
      return;
    }

    setIsStarting(true);
    setStatusMessage('Starting AI session...');
    try {
      const currentSettings = await window.api.settings.get();
      const aiSettings = {
        ollamaHost: currentSettings.aiOllamaHost,
        ollamaPort: currentSettings.aiOllamaPort,
        modelName: currentSettings.aiModelName,
        enableOcr: currentSettings.aiOcrEnabled,
      };
      const result = await window.api.ai.start(profileId, aiSettings);
      setSession(result);
      setStatusMessage('AI session started. Enter a task and submit it.');
      setMessages([]);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Failed to start AI session.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStopSession() {
    if (!session) {
      return;
    }

    setStatusMessage('Stopping AI session...');
    try {
      await window.api.ai.stop(session.id);
    } catch (error: any) {
      console.error(error);
    }
    setSession(null);
    setStatusMessage('AI session stopped.');
  }

  async function handleSendInstruction() {
    if (!session || !instruction.trim()) {
      return;
    }

    setIsSending(true);
    setStatusMessage('Sending instruction to AI...');
    try {
      const response = await window.api.ai.sendInstruction(session.id, instruction.trim());
      setMessages((current) => [...current, `You: ${instruction.trim()}`, `AI: ${response.message}`]);

      if (response.reprompt) {
        setMessages((current) => [...current, `AI asks: ${response.reprompt}`]);
        setInstruction(response.reprompt);
        setStatusMessage('AI requested a follow-up prompt. Edit or resend the suggested reprompt.');
      } else {
        setInstruction('');
        setStatusMessage(response.success ? 'AI instruction completed.' : 'AI completed with warnings.');
      }
    } catch (error: any) {
      setStatusMessage(error?.message || 'AI instruction failed.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="card">
      <div className="header-row">
        <div>
          <h3 className="title">AI Agent</h3>
          <p className="subtitle">Opt in to start an AI-driven browser session for the selected profile.</p>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">AI session status</label>
        <div style={{ color: '#cbd5e1' }}>{sessionLabel}</div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="button-secondary" onClick={handleStartSession} disabled={!canStart || isStarting}>
          {isStarting ? 'Starting...' : 'Start AI session'}
        </button>
        <button className="button-secondary" onClick={handleStopSession} disabled={!session}>
          Stop AI session
        </button>
      </div>

      <div className="input-group" style={{ marginTop: '1rem' }}>
        <label className="input-label">Task instruction</label>
        <textarea
          className="input-field"
          rows={4}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Tell the AI what to do in the launched browser session..."
          disabled={!session}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="button-secondary" onClick={handleSendInstruction} disabled={!session || isSending || !instruction.trim()}>
          {isSending ? 'Sending...' : 'Send instruction'}
        </button>
      </div>

      <div style={{ marginTop: '1rem', color: '#94a3b8' }}>{statusMessage}</div>

      {messages.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          {messages.map((message, index) => (
            <div key={`${message}-${index}`} style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
              {message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
