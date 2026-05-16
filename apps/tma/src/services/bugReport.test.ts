import { describe, expect, it } from 'vitest';
import { buildBugReportIssueUrl, formatBugReportBody, type BugReportSnapshot } from './bugReport';

describe('bug report issue builder', () => {
  it('creates a GitHub issue URL with session logs', () => {
    const url = buildBugReportIssueUrl(snapshot([
      { ts: '2026-05-16T12:00:00.000Z', level: 'info', event: 'match.found', data: { matchId: '42' } },
    ]));

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/elemgame/elemgameV2/issues/new');
    expect(parsed.searchParams.get('labels')).toBe('bug');
    expect(parsed.searchParams.get('title')).toContain('match 42');
    expect(parsed.searchParams.get('body')).toContain('match.found');
  });

  it('trims logs to keep the issue URL openable', () => {
    const logs = Array.from({ length: 140 }, (_, index) => ({
      ts: '2026-05-16T12:00:00.000Z',
      level: 'info' as const,
      event: `spacetime.trace.${index}`,
      data: {
        event: index === 139 ? 'round.timeout_forfeit' : 'round.move_submitted',
        matchId: '43',
        round: 1,
        message: 'x'.repeat(80),
        data: 'winner=c200 score=0:3',
        ignoredNested: { tooMuch: 'y'.repeat(500) },
      },
    }));

    const url = buildBugReportIssueUrl(snapshot(logs));
    const body = new URL(url).searchParams.get('body') ?? '';

    expect(url.length).toBeLessThan(9000);
    expect(body).toContain('spacetime.trace.');
    expect(body).toContain('round.timeout_forfeit');
    expect(body).toContain('"matchId": "43"');
    expect(body).not.toContain('ignoredNested');
  });

  it('formats the report as JSON inside markdown', () => {
    const body = formatBugReportBody(snapshot([], {
      economy: {
        currency: 'tELM',
        balanceKind: 'demo_teml',
        matchBalanceKind: 'demo_teml',
        balance: 1000,
      },
    }));

    expect(body).toContain('## Session report');
    expect(body).toContain('```json');
    expect(body).toContain('"database": "elmental-v2"');
    expect(body).toContain('"currency": "tELM"');
    expect(body).toContain('"balanceKind": "demo_teml"');
    expect(body).toContain('"matchBalanceKind": "demo_teml"');
  });
});

function snapshot(logs: BugReportSnapshot['logs'], game: Record<string, unknown> = {}): BugReportSnapshot {
  return {
    generatedAt: '2026-05-16T12:00:00.000Z',
    app: {
      transport: 'spacetime',
      traceEnabled: 'true',
      spacetimeUri: 'https://maincloud.spacetimedb.com',
      database: 'elmental-v2',
      room: 'public',
      botFallbackSeconds: 30,
      location: 'https://elemgame.github.io/elemgameV2/',
      userAgent: 'vitest',
    },
    game: {
      matchId: '42',
      matchStatus: 'playing',
      currentRound: 2,
      roundPhase: 'select',
      ...game,
    },
    logs,
  };
}
