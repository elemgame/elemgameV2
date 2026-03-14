import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../stores/gameStore';
import type { EnergyLevel, MatchResult, LastRoundResult } from '../stores/gameStore';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

// ---------------------------------------------------------------------------
// Events emitted by server
// ---------------------------------------------------------------------------
type ServerToClientEvents = {
  'match:found': (data: { matchId: string; opponent: { name: string; rating: number } }) => void;
  'round:start': (data: { round: number; timerMs: number }) => void;
  'round:opponent_committed': () => void;
  'round:reveal': (data: {
    myMove: number;
    opponentMove: number;
    result: 'win' | 'lose' | 'draw';
    myEnergyAfter: number;
    opponentEnergyLevel: EnergyLevel;
    myScore: number;
    opponentScore: number;
    wasOverclocked: boolean;
  }) => void;
  'match:result': (data: MatchResult) => void;
  'match:cancelled': () => void;
  'error': (msg: string) => void;
  'timer:tick': (data: { seconds: number }) => void;
};

// ---------------------------------------------------------------------------
// Events emitted by client
// ---------------------------------------------------------------------------
type ClientToServerEvents = {
  'queue:join': (data: { telegramId: number; mode: string; boost: boolean }) => void;
  'queue:leave': () => void;
  'round:commit': (data: { matchId: string; moveHash: string }) => void;
  'round:reveal': (data: { matchId: string; moveId: number; salt: string }) => void;
};

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------

export function connectSocket(telegramId: number, initData: string): Socket {
  if (socket?.connected) return socket;

  socket = io(SERVER_URL, {
    auth: { telegramId, initData },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }) as Socket<ServerToClientEvents, ClientToServerEvents>;

  attachListeners(socket);
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

// ---------------------------------------------------------------------------
// Client → Server actions
// ---------------------------------------------------------------------------

export function joinQueue(data: { telegramId: number; mode: string; boost: boolean }): void {
  socket?.emit('queue:join', data);
}

export function leaveQueue(): void {
  socket?.emit('queue:leave');
}

export function commitMove(matchId: string, moveHash: string): void {
  socket?.emit('round:commit', { matchId, moveHash });
}

export function revealMove(matchId: string, moveId: number, salt: string): void {
  socket?.emit('round:reveal', { matchId, moveId, salt });
}

// ---------------------------------------------------------------------------
// Attach server → client event listeners wired to the Zustand store
// ---------------------------------------------------------------------------

function attachListeners(sock: Socket): void {
  sock.on('match:found', ({ matchId, opponent }) => {
    const store = useGameStore.getState();
    store.setMatchFound(matchId, opponent.name, opponent.rating);
  });

  sock.on('round:start', ({ timerMs }) => {
    const store = useGameStore.getState();
    store.setRoundPhase('select');
    store.setRoundTimer(Math.ceil(timerMs / 1000));
  });

  sock.on('round:opponent_committed', () => {
    const store = useGameStore.getState();
    // If we already committed, transition to waiting; otherwise stay in commit
    if (store.roundPhase === 'commit') {
      store.setRoundPhase('reveal');
    }
  });

  sock.on('round:reveal', (data) => {
    const store = useGameStore.getState();

    const lastRound: LastRoundResult = {
      myMove: data.myMove,
      opponentMove: data.opponentMove,
      result: data.result,
      myEnergyAfter: data.myEnergyAfter,
      opponentEnergyLevel: data.opponentEnergyLevel,
      wasOverclocked: data.wasOverclocked,
    };

    store.setLastRoundResult(lastRound);
    store.updateEnergy(data.myEnergyAfter);
    store.updateOpponentEnergyLevel(data.opponentEnergyLevel);
    store.updateScores(data.myScore, data.opponentScore);
    store.setRoundPhase('result');
  });

  sock.on('match:result', (result) => {
    const store = useGameStore.getState();
    store.setMatchResult(result);
  });

  sock.on('match:cancelled', () => {
    const store = useGameStore.getState();
    store.cancelMatchmaking();
  });

  sock.on('timer:tick', ({ seconds }) => {
    const store = useGameStore.getState();
    store.setRoundTimer(seconds);
  });

  sock.on('error', (msg) => {
    console.error('[Socket] Server error:', msg);
  });
}

// ---------------------------------------------------------------------------
// Utility: generate a commit hash (SHA-256 of moveId + salt)
// ---------------------------------------------------------------------------

export async function generateMoveCommit(
  moveId: number,
  salt: string,
): Promise<string> {
  const message = `${moveId}:${salt}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
