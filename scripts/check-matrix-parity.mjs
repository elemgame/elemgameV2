import { readFileSync } from 'node:fs';
import { resolveRound, MoveId, RoundResult } from '../packages/shared/dist/index.js';

const backendSource = readFileSync(new URL('../apps/spacetime/spacetimedb/src/index.ts', import.meta.url), 'utf8');
const matrixMatch = backendSource.match(/function roundOutcome[\s\S]*?const matrix = \[([\s\S]*?)\] as const;/);

if (!matrixMatch) {
  throw new Error('Could not find SpacetimeDB roundOutcome matrix');
}

const backendRows = [...matrixMatch[1].matchAll(/\[([^\]]+)\]/g)].map((row) =>
  [...row[1].matchAll(/'([^']+)'/g)].map((cell) => cell[1]),
);

if (backendRows.length !== 6 || backendRows.some((row) => row.length !== 6)) {
  throw new Error(`Expected a 6x6 SpacetimeDB matrix, got ${backendRows.length} rows`);
}

const moveIds = [
  MoveId.Earth,
  MoveId.Fire,
  MoveId.Water,
  MoveId.EarthPlus,
  MoveId.FirePlus,
  MoveId.WaterPlus,
];

const expected = {
  [RoundResult.Win]: 'win',
  [RoundResult.Lose]: 'lose',
  [RoundResult.Draw]: 'draw',
};

const mismatches = [];

for (const p1Move of moveIds) {
  for (const p2Move of moveIds) {
    const shared = resolveRound(p1Move, p2Move).p1Result;
    const backend = backendRows[p1Move]?.[p2Move];
    if (backend !== expected[shared]) {
      mismatches.push(`p1=${p1Move} p2=${p2Move}: shared=${expected[shared]} backend=${backend}`);
    }
  }
}

if (mismatches.length > 0) {
  console.error('SpacetimeDB matrix differs from shared game logic:');
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log('SpacetimeDB roundOutcome matrix matches shared game logic.');
