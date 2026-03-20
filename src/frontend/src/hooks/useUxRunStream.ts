/**
 * @file src/frontend/src/hooks/useUxRunStream.ts
 * SSE client hook that subscribes to UX Design Agent pipeline events.
 * Call with a runId once returned from POST /api/ux/run.
 */
import { useState, useEffect, useCallback } from 'react';

// ─── Event Types ─────────────────────────────────────────────────────────────

export type PhaseKey = 'idle' | 'enhancing' | 'designing' | 'stitch_loop' | 'building' | 'done' | 'error';

export interface UxPageState {
  id: string;
  pageName: string;
  pageTitle: string;
  status: 'pending' | 'designing' | 'review' | 'committed' | 'building' | 'done' | 'error';
  reviewIterations: number;
  reviewScore?: number;
  screenshotUrl?: string;
  githubHtmlPath?: string;
  githubScreenshotPath?: string;
  julesSessionId?: string;
  julesPrUrl?: string;
  error?: string;
}

export interface ActivityLog {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  pageName?: string;
}

export interface UxRunStreamState {
  phase: PhaseKey;
  status: 'idle' | 'running' | 'done' | 'error';
  pages: UxPageState[];
  activityLog: ActivityLog[];
  error?: string;
  connected: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUxRunStream(runId: string | null): UxRunStreamState {
  const [state, setState] = useState<UxRunStreamState>({
    phase: 'idle',
    status: 'idle',
    pages: [],
    activityLog: [],
    connected: false,
  });

  const log = useCallback((type: string, message: string, pageName?: string) => {
    setState((prev) => ({
      ...prev,
      activityLog: [
        { id: crypto.randomUUID(), type, message, timestamp: new Date().toISOString(), pageName },
        ...prev.activityLog,
      ].slice(0, 200), // Keep last 200 events
    }));
  }, []);

  useEffect(() => {
    if (!runId) return;

    const es = new EventSource(`/api/ux/run/${runId}/stream`);

    es.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
      log('system', 'Connected to pipeline stream');
    };

    es.onerror = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };

    es.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data) as { type: string; data: any };

        switch (event.type) {
          case 'state_snapshot': {
            const snap = event.data;
            setState((prev) => ({
              ...prev,
              phase: snap.phase ?? prev.phase,
              status: snap.status ?? prev.status,
              pages: snap.pages ?? prev.pages,
            }));
            break;
          }
          case 'phase_start': {
            const phase = event.data.phase as PhaseKey;
            setState((prev) => ({ ...prev, phase, status: 'running' }));
            log('phase', `Phase started: ${phase}`);
            break;
          }
          case 'pages_discovered': {
            const pages: UxPageState[] = event.data.pages;
            setState((prev) => ({ ...prev, pages }));
            log('info', `Discovered ${pages.length} page(s) from design-md`);
            break;
          }
          case 'page_update': {
            const { pageName, status, iteration, error } = event.data;
            setState((prev) => ({
              ...prev,
              pages: prev.pages.map((p) =>
                p.pageName === pageName ? { ...p, status, reviewIterations: iteration ?? p.reviewIterations, error } : p,
              ),
            }));
            log('page', `${pageName}: ${status}${iteration ? ` (iteration ${iteration})` : ''}`, pageName);
            break;
          }
          case 'stitch_preview': {
            const { pageName, screenshotUrl, htmlPath, score, iterations } = event.data;
            setState((prev) => ({
              ...prev,
              pages: prev.pages.map((p) =>
                p.pageName === pageName
                  ? { ...p, status: 'committed', screenshotUrl, githubHtmlPath: htmlPath, reviewScore: score, reviewIterations: iterations }
                  : p,
              ),
            }));
            log('stitch', `${pageName}: mockup committed (score ${score}/10, ${iterations} iterations)`, pageName);
            break;
          }
          case 'jules_status': {
            const { phase, sessionId, status, pageName } = event.data;
            if (sessionId) {
              setState((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.pageName === pageName && pageName ? { ...p, julesSessionId: sessionId } : p,
                ),
              }));
            }
            log('jules', `Jules [${phase}]: ${status}${sessionId ? ` (${sessionId.slice(0, 8)}...)` : ''}`, pageName);
            break;
          }
          case 'run_complete': {
            setState((prev) => ({ ...prev, phase: 'done', status: 'done' }));
            log('system', '✅ UX Design pipeline completed!');
            es.close();
            break;
          }
          case 'run_error': {
            setState((prev) => ({ ...prev, phase: 'error', status: 'error', error: event.data.error }));
            log('error', `Pipeline error: ${event.data.error}`);
            es.close();
            break;
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, [runId, log]);

  return state;
}
