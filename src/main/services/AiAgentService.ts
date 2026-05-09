import { v4 as uuidv4 } from 'uuid';
import { browserLauncher } from './BrowserLauncher';
import { OllamaService, type OllamaMessage } from './OllamaService';
import { OcrService } from './OcrService';
import type {
  AiAgentAction,
  AiAgentResponse,
  AiAgentSession,
  AiAgentSessionHistoryEntry,
  AiAgentSettings,
  AiAgentActionResult,
} from '../../shared/types';

interface AiAgentSessionEntry {
  session: AiAgentSession;
  settings: AiAgentSettings;
  messages: OllamaMessage[];
}

const DEFAULT_AGENT_PROMPT = `You are an automated browser assistant that can perform tasks on a Chromium browser page.
You must only reply with valid JSON and never include any other text.
The JSON response should be structured like this:
{
  "actions": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "type", "selector": "input[name=q]", "text": "hello" },
    { "type": "wait", "timeoutMs": 1000 },
    { "type": "readText", "selector": "body" }
  ],
  "comment": "Explain what was done or what to do next.",
  "done": false,
  "reprompt": "If you need more information from the user, provide the follow-up question or clarification here. Otherwise leave this empty."
}
Available action types:
- navigate: go to a URL
- click: click a page element by selector or coordinates
- type: type text into a selector or keyboard
- fill: set value into an input selector
- wait: wait for a timeout in milliseconds
- screenshot: capture a screenshot of the page
- readText: read visible text from the page or selector
- captureDom: return the page HTML
Return an empty actions array if no browser action is required.
When the task is finished, set "done" to true and keep "actions" empty.
If you are uncertain or need clarification, set "done" to false and return a meaningful "reprompt" string that the user can send back as the next instruction.
If no clarification is required, set "reprompt" to an empty string.
Always keep the output parsable JSON.`;

interface ParsedAgentResponse {
  actions: AiAgentAction[];
  comment: string;
  done: boolean;
  reprompt: string;
}

export class AiAgentService {
  private readonly sessions = new Map<string, AiAgentSessionEntry>();
  private readonly ocrService = new OcrService();

  listSessions(): AiAgentSession[] {
    return Array.from(this.sessions.values()).map((entry) => entry.session);
  }

  getSession(sessionId: string): AiAgentSession | null {
    return this.sessions.get(sessionId)?.session ?? null;
  }

  async createSession(profileId: string, settings: AiAgentSettings = {}): Promise<AiAgentSession> {
    const page = await browserLauncher.getPage(profileId);
    if (!page) {
      throw new Error('A running browser session is required before starting an AI agent. Launch the profile first.');
    }

    const sessionId = uuidv4();
    const session: AiAgentSession = {
      id: sessionId,
      profileId,
      status: 'idle',
      lastUpdated: Date.now(),
      history: [],
    };

    const entry: AiAgentSessionEntry = {
      session,
      settings,
      messages: [
        {
          role: 'system',
          content: DEFAULT_AGENT_PROMPT,
        },
      ],
    };

    this.sessions.set(sessionId, entry);
    return session;
  }

  async stopSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    entry.session.status = 'stopped';
    entry.session.lastUpdated = Date.now();
    this.sessions.delete(sessionId);
  }

  async sendInstruction(sessionId: string, instruction: string): Promise<AiAgentResponse> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error('AI session not found. Start a new AI session first.');
    }

    const { session, settings, messages } = entry;
    const page = await browserLauncher.getPage(session.profileId);
    if (!page) {
      session.status = 'error';
      session.lastUpdated = Date.now();
      throw new Error('Browser session no longer exists. Please relaunch the profile.');
    }

    session.status = 'running';
    session.lastUpdated = Date.now();

    const taskDescription = instruction.trim();
    const actionResults: AiAgentActionResult[] = [];
    const ollama = new OllamaService(settings);

    messages.push({
      role: 'user',
      content: `Task: ${taskDescription}

Current page state:
${await this.getPageObservation(page)}`,
    });

    const rawResponse = await ollama.createChatCompletion(messages);
    messages.push({ role: 'assistant', content: rawResponse });

    const parsed = this.parseAgentResponse(rawResponse);
    const currentActionResults = await this.executeActions(page, parsed.actions);
    actionResults.push(...currentActionResults);

    const response: AiAgentResponse = {
      success: actionResults.every((result) => result.status === 'success'),
      message: parsed.comment || 'Agent completed execution.',
      actions: actionResults,
      rawOutput: rawResponse,
      reprompt: parsed.reprompt || undefined,
    };

    session.history.push({ role: 'user', content: instruction, timestamp: Date.now() });
    session.history.push({ role: 'assistant', content: rawResponse, timestamp: Date.now() });
    session.status = 'idle';
    session.lastUpdated = Date.now();

    return response;
  }

  private async getPageObservation(page: any): Promise<string> {
    const url = page.url?.() ?? 'unknown';
    const title = await page.title().catch(() => '');
    const snippet = await page.evaluate(() => {
      const text = document.body?.innerText || document.documentElement?.innerText || '';
      return text.slice(0, 2000);
    }).catch(() => '');

    return [`URL: ${url}`, `Title: ${title}`, `Text snippet:`, snippet].join('\n');
  }

  private parseAgentResponse(raw: string): ParsedAgentResponse {
    const jsonText = this.extractJson(raw);
    if (!jsonText) {
      throw new Error('AI response did not contain valid JSON.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Unable to parse AI response JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return {
      actions,
      comment: String(parsed.comment ?? parsed.message ?? 'No comment provided.'),
      done: Boolean(parsed.done),
      reprompt: String(parsed.reprompt ?? ''),
    };
  }

  private extractJson(raw: string): string | null {
    const open = raw.indexOf('{');
    const close = raw.lastIndexOf('}');
    if (open === -1 || close === -1 || close <= open) {
      return null;
    }
    return raw.slice(open, close + 1);
  }

  private formatActionResults(actionResults: AiAgentActionResult[]): string {
    if (actionResults.length === 0) {
      return 'No actions were performed.';
    }

    return actionResults
      .map((result, index) => {
        const actionJson = JSON.stringify(result.action);
        const statusText = result.status === 'success' ? 'success' : `failure (${result.error ?? 'unknown error'})`;
        return `- Action ${index + 1}: ${actionJson}\n  status: ${statusText}`;
      })
      .join('\n');
  }

  private async executeActions(page: any, actions: AiAgentAction[]): Promise<AiAgentActionResult[]> {
    const results: AiAgentActionResult[] = [];

    for (const action of actions) {
      const result: AiAgentActionResult = {
        action,
        status: 'success',
      };

      try {
        switch (action.type) {
          case 'navigate':
            if (!action.url) {
              throw new Error('Missing url for navigate action.');
            }
            await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: action.timeoutMs ?? 30000 });
            break;
          case 'click':
            if (action.selector) {
              await page.click(action.selector, { button: action.button ?? 'left' });
            } else if (typeof action.x === 'number' && typeof action.y === 'number') {
              await page.mouse.click(action.x, action.y, { button: action.button ?? 'left' });
            } else {
              throw new Error('Missing selector or coordinates for click action.');
            }
            break;
          case 'type':
            if (action.selector) {
              await page.type(action.selector, action.text ?? '', { delay: 50 });
            } else if (typeof action.text === 'string') {
              await page.keyboard.type(action.text, { delay: 50 });
            } else {
              throw new Error('Missing selector or text for type action.');
            }
            break;
          case 'fill':
            if (!action.selector) {
              throw new Error('Missing selector for fill action.');
            }
            await page.fill(action.selector, action.text ?? '');
            break;
          case 'wait':
            await page.waitForTimeout(action.timeoutMs ?? 1000);
            break;
          case 'screenshot': {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true });
            result.result = Buffer.from(buffer).toString('base64');
            break;
          }
          case 'readText': {
            if (action.selector) {
              result.result = await page.locator(action.selector).innerText();
            } else {
              result.result = await page.evaluate(() => document.body?.innerText || document.documentElement?.innerText || '');
            }
            break;
          }
          case 'captureDom': {
            result.result = await page.content();
            break;
          }
          default:
            throw new Error(`Unsupported action type: ${action.type}`);
        }
      } catch (error) {
        result.status = 'failure';
        result.error = error instanceof Error ? error.message : String(error);
      }

      results.push(result);
    }

    return results;
  }
}

export const aiAgentService = new AiAgentService();
