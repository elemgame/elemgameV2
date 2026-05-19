import { useGameStore } from '../stores/gameStore';
import { balanceKindForUser, currencyForUser } from './economy';
import { getDatabaseName, getMatchRoom, getSpacetimeUri } from './gameProvider/spacetimeProvider';

const ISSUE_URL = 'https://github.com/elemgame/elemgameV2/issues/new';
const LOG_STORAGE_KEY = 'elmental.bugReport.logs';
const MAX_LOGS = 180;
const MAX_ISSUE_URL_LENGTH = 7600;

type LogLevel = 'info' | 'warn' | 'error';

export interface BugReportLogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  data?: unknown;
}

export interface BugReportSnapshot {
  generatedAt: string;
  app: {
    transport: string;
    traceEnabled: string;
    spacetimeUri: string;
    database: string;
    room: string;
    location: string;
    userAgent: string;
  };
  game: Record<string, unknown>;
  logs: BugReportLogEntry[];
}

let installed = false;
let memoryLogs: BugReportLogEntry[] = [];

export function installBugReportCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    recordGameLog('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    recordGameLog('error', 'window.unhandled_rejection', { reason: serializeValue(event.reason, 2) });
  });

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    recordGameLog('warn', 'console.warn', { message: stringifyArgs(args) });
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    recordGameLog('error', 'console.error', { message: stringifyArgs(args) });
    originalError(...args);
  };
}

export function recordGameLog(level: LogLevel, event: string, data?: unknown): void {
  const logs = readLogs();
  logs.push({
    ts: new Date().toISOString(),
    level,
    event,
    data: serializeValue(data, 4),
  });
  const trimmed = logs.slice(-MAX_LOGS);
  memoryLogs = trimmed;
  try {
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Memory storage still keeps logs for the current page lifecycle.
  }
}

export function openBugReportIssue(): void {
  recordGameLog('info', 'bug_report.opened', {});
  const url = buildBugReportIssueUrl(createBugReportSnapshot());
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}

export function buildBugReportIssueUrl(snapshot: BugReportSnapshot): string {
  const url = new URL(ISSUE_URL);
  url.searchParams.set('title', buildTitle(snapshot));
  url.searchParams.set('labels', 'bug');

  const variants: BugReportSnapshot[] = [
    snapshot,
    { ...snapshot, logs: snapshot.logs.slice(-80) },
    { ...snapshot, logs: snapshot.logs.slice(-40) },
    { ...snapshot, logs: snapshot.logs.slice(-20) },
    { ...snapshot, logs: compactLogs(snapshot.logs.slice(-40)) },
    { ...snapshot, logs: compactLogs(snapshot.logs.slice(-20)) },
  ];

  for (const variant of variants) {
    url.searchParams.set('body', formatBugReportBody(variant));
    if (url.toString().length <= MAX_ISSUE_URL_LENGTH) return url.toString();
  }

  url.searchParams.set('body', formatBugReportBody({ ...snapshot, logs: compactLogs(snapshot.logs.slice(-10)) }));
  return url.toString();
}

export function createBugReportSnapshot(): BugReportSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    app: {
      transport: import.meta.env.VITE_GAME_TRANSPORT ?? 'spacetime',
      traceEnabled: import.meta.env.VITE_GAME_TRACE ?? 'true',
      spacetimeUri: getSpacetimeUri(),
      database: getDatabaseName(),
      room: getMatchRoom(),
      location: sanitizedLocation(),
      userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    },
    game: gameSnapshot(),
    logs: readLogs(),
  };
}

export function formatBugReportBody(snapshot: BugReportSnapshot): string {
  const payload = JSON.stringify(
    {
      generatedAt: snapshot.generatedAt,
      app: snapshot.app,
      game: snapshot.game,
      logs: snapshot.logs,
    },
    null,
    2,
  );

  return [
    '## Session report',
    '',
    '```json',
    payload,
    '```',
  ].join('\n');
}

function buildTitle(snapshot: BugReportSnapshot): string {
  const matchId = typeof snapshot.game.matchId === 'string' && snapshot.game.matchId
    ? `match ${snapshot.game.matchId}`
    : 'session';
  return `[Bug Report] ${matchId} ${snapshot.generatedAt}`;
}

function compactLogs(logs: BugReportLogEntry[]): BugReportLogEntry[] {
  return logs.map(({ ts, level, event, data }) => ({
    ts,
    level,
    event,
    data: compactLogData(data),
  }));
}

function gameSnapshot(): Record<string, unknown> {
  const state = useGameStore.getState();
  const currency = currencyForUser(state.telegramUser);
  const balanceKind = balanceKindForUser(state.telegramUser);
  return {
    currentScreen: state.currentScreen,
    matchStatus: state.matchStatus,
    matchId: state.matchId,
    matchBalanceKind: state.matchBalanceKind,
    isPlayer1: state.isPlayer1,
    opponentName: state.opponentName,
    opponentRating: state.opponentRating,
    gameMode: state.gameMode,
    boostEnabled: state.boostEnabled,
    myEnergy: state.myEnergy,
    opponentEnergyLevel: state.opponentEnergyLevel,
    myScore: state.myScore,
    opponentScore: state.opponentScore,
    currentRound: state.currentRound,
    roundPhase: state.roundPhase,
    selectedMove: state.selectedMove,
    roundTimer: state.roundTimer,
    lastRoundResult: state.lastRoundResult,
    matchResult: state.matchResult,
    roundHistory: state.roundHistory,
    stats: state.stats,
    opponentStats: state.opponentStats,
    rating: state.rating,
    elmBalance: state.elmBalance,
    seasonPoints: state.seasonPoints,
    economy: {
      currency,
      balanceKind,
      matchBalanceKind: state.matchBalanceKind,
      balance: state.elmBalance,
      walletHistory: {
        status: state.walletHistoryStatus,
        summary: state.walletHistorySummary,
        recent: state.walletHistory.slice(0, 8).map(entry => ({
          kind: entry.kind,
          status: entry.status,
          elmAmount: entry.elmAmount,
          starsAmount: entry.starsAmount,
          paymentId: entry.paymentId,
          matchId: entry.matchId,
          occurredAt: entry.occurredAt,
        })),
      },
    },
    user: state.telegramUser
      ? {
          id: state.telegramUser.id,
          firstName: state.telegramUser.first_name,
          username: state.telegramUser.username,
          source: state.telegramUser.source,
        }
      : null,
  };
}

function readLogs(): BugReportLogEntry[] {
  if (typeof sessionStorage === 'undefined') return memoryLogs;
  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return memoryLogs;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return memoryLogs;
    memoryLogs = parsed.slice(-MAX_LOGS);
  } catch {
    // Ignore corrupt storage and continue with memory logs.
  }
  return memoryLogs;
}

function sanitizedLocation(): string {
  if (typeof window === 'undefined') return 'unknown';
  const url = new URL(window.location.href);
  url.hash = '';
  for (const key of Array.from(url.searchParams.keys())) {
    if (/token|auth|init|signature|hash/i.test(key)) {
      url.searchParams.set(key, '[redacted]');
    }
  }
  return url.toString();
}

function stringifyArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(serializeValue(arg, 2));
    } catch {
      return String(arg);
    }
  }).join(' ');
}

function serializeValue(value: unknown, depth: number): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (depth <= 0) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => serializeValue(item, depth - 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value).slice(0, 30)) {
      if (/token|auth|secret|signature|hash/i.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = serializeValue(nested, depth - 1);
      }
    }
    return output;
  }
  return String(value);
}

function compactLogData(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return value.slice(0, 220);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 8).map(compactLogData);
  if (typeof value !== 'object') return String(value).slice(0, 220);

  const source = value as Record<string, unknown>;
  const allowedKeys = [
    'event',
    'matchId',
    'round',
    'phase',
    'status',
    'message',
    'data',
    'score',
    'winner',
    'room',
    'mode',
      'stake',
      'economyModel',
      'seasonPoints',
      'seasonPointsEarned',
      'name',
    'opponentName',
    'opponentRating',
    'isPlayer1',
    'currentRound',
    'p1',
    'p2',
    'p1Move',
    'p2Move',
    'move',
    'myMove',
    'opponentMove',
    'result',
    'myScore',
    'opponentScore',
    'selectedMove',
    'code',
    'source',
  ];
  const output: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (!(key in source)) continue;
    const nested = source[key];
    if (typeof nested === 'string') {
      output[key] = nested.slice(0, 220);
    } else if (typeof nested === 'bigint') {
      output[key] = nested.toString();
    } else if (nested === undefined || nested === null || typeof nested === 'number' || typeof nested === 'boolean') {
      output[key] = nested;
    } else {
      output[key] = serializeValue(nested, 1);
    }
  }
  return output;
}
