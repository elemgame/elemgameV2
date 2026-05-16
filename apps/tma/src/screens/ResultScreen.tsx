import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { RAKE_PERCENT } from '@elmental/shared';
import { haptic } from '../services/telegram';
import { applyResults } from '../services/gameService';
import { EarthIcon } from '../components/icons/EarthIcon';
import { FireIcon } from '../components/icons/FireIcon';
import { WaterIcon } from '../components/icons/WaterIcon';
import { TrophyIcon } from '../components/icons/TrophyIcon';
import { SkullIcon } from '../components/icons/SkullIcon';
import { HandshakeIcon } from '../components/icons/HandshakeIcon';
import { CoinsIcon } from '../components/icons/CoinsIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { SwordsIcon } from '../components/icons/SwordsIcon';
import { HomeIcon } from '../components/icons/HomeIcon';
import { FlameIcon } from '../components/icons/FlameIcon';
import { CheckIcon } from '../components/icons/CheckIcon';
import { BoltIcon } from '../components/icons/BoltIcon';

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  duration: number;
  delay: number;
}

function generateConfetti(count: number): ConfettiPiece[] {
  const colors = ['#ffd700', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f59e0b'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
    duration: 2 + Math.random() * 2,
    delay: Math.random() * 1.5,
  }));
}

const CONFETTI = generateConfetti(30);

function MoveIconDisplay({ id, size }: { id: number; size: number }) {
  const enhanced = id >= 3;
  const cls = enhanced
    ? 'text-gold drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]'
    : id === 0 ? 'text-earth-light' : id === 1 ? 'text-fire' : 'text-water-light';
  switch (id % 3) {
    case 0: return <EarthIcon size={size} className={cls} />;
    case 1: return <FireIcon size={size} className={cls} />;
    case 2: return <WaterIcon size={size} className={cls} />;
  }
}

export function ResultScreen() {
  const {
    matchResult,
    opponentName,
    roundHistory,
    resetMatch,
    setScreen,
    stats,
    setPlayerStats,
    elmBalance,
    rating,
  } = useGameStore();

  const hasFiredHaptic = useRef(false);

  useEffect(() => {
    if (!matchResult || hasFiredHaptic.current) return;
    hasFiredHaptic.current = true;
    if (matchResult.winner === 'me') {
      haptic.success();
    } else if (matchResult.winner === 'opponent') {
      haptic.error();
    } else {
      haptic.warning();
    }
  }, [matchResult]);

  const handlePlayAgain = () => {
    haptic.medium();
    applyResults('playAgain');
  };

  const handleHome = () => {
    haptic.light();
    applyResults('home');
  };

  if (!matchResult) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-game-bg p-6 gap-4 text-center">
        <div className="text-text-secondary">Result is still syncing...</div>
        <button data-nav className="btn-ghost w-full max-w-xs py-3 text-sm" onClick={handleHome}>
          Back to Home
        </button>
      </div>
    );
  }

  const isWin = matchResult.winner === 'me';
  const isDraw = matchResult.winner === 'draw';
  const isLose = matchResult.winner === 'opponent';

  const resultConfig = isWin
    ? {
        label: 'VICTORY!',
        icon: <TrophyIcon size={56} className="text-energy-high" />,
        color: '#22c55e',
        bg: 'linear-gradient(180deg, rgba(34,197,94,0.15) 0%, #0a0a1a 60%)',
        subtext: 'Excellent battle!',
      }
    : isDraw
    ? {
        label: 'DRAW',
        icon: <HandshakeIcon size={56} className="text-energy-mid" />,
        color: '#eab308',
        bg: 'linear-gradient(180deg, rgba(234,179,8,0.12) 0%, #0a0a1a 60%)',
        subtext: 'A balanced match',
      }
    : {
        label: 'DEFEAT',
        icon: <SkullIcon size={56} className="text-energy-low" />,
        color: '#ef4444',
        bg: 'linear-gradient(180deg, rgba(239,68,68,0.12) 0%, #0a0a1a 60%)',
        subtext: 'Better luck next time',
      };

  return (
    <div
      className="relative flex flex-col h-full overflow-y-auto scrollbar-hide"
      style={{ background: resultConfig.bg }}
    >
      {/* Confetti for wins */}
      {isWin && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {CONFETTI.map((piece) => (
            <motion.div
              key={piece.id}
              className="absolute rounded-sm"
              style={{
                left: `${piece.x}%`,
                top: '-10px',
                width: piece.size,
                height: piece.size,
                background: piece.color,
              }}
              animate={{
                y: '110vh',
                rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: piece.duration,
                delay: piece.delay,
                ease: 'linear',
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-5 p-5 pt-8">
        {/* Result icon + label */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 180 }}
        >
          <motion.span
            className="flex items-center justify-center"
            animate={isWin ? { rotate: [0, -10, 10, -5, 5, 0] } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {resultConfig.icon}
          </motion.span>
          <motion.div
            className="text-4xl font-black tracking-wider text-center"
            style={{
              color: resultConfig.color,
              textShadow: `0 0 30px ${resultConfig.color}80`,
            }}
          >
            {resultConfig.label}
          </motion.div>
          <div className="text-sm text-text-secondary">{resultConfig.subtext}</div>
        </motion.div>

        {/* Score summary */}
        <motion.div
          className="glass-card p-4 w-full flex items-center justify-around"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-center">
            <div className="text-xs text-text-secondary mb-1">You</div>
            <div className="text-3xl font-black text-energy-high">{matchResult.myScore}</div>
          </div>
          <div
            className="text-3xl font-black text-text-muted"
            style={{ textShadow: '0 0 10px rgba(255,255,255,0.1)' }}
          >
            vs
          </div>
          <div className="text-center">
            <div className="text-xs text-text-secondary mb-1 truncate max-w-[80px]">{opponentName}</div>
            <div className="text-3xl font-black text-energy-low">{matchResult.opponentScore}</div>
          </div>
        </motion.div>

        {/* ELM + Rating changes */}
        <motion.div
          className="glass-card p-4 w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <CoinsIcon size={18} className="text-gold" />
              <span className="text-sm text-text-secondary">ELM Change</span>
            </div>
            <span
              className="text-lg font-black"
              style={{
                color: matchResult.elmEarned >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {matchResult.elmEarned >= 0 ? '+' : ''}{matchResult.elmEarned}
            </span>
          </div>
          <div
            className="my-2 h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          />
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <StarIcon size={18} className="text-gold" />
              <span className="text-sm text-text-secondary">Rating Change</span>
            </div>
            <span
              className="text-lg font-black"
              style={{
                color: matchResult.ratingChange >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {matchResult.ratingChange >= 0 ? '+' : ''}{matchResult.ratingChange}
            </span>
          </div>
        </motion.div>

        {/* Economy Breakdown */}
        {'stake' in matchResult && (
          <motion.div
            className="glass-card p-4 w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
              Economy Breakdown
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Stake</span>
                <span className="text-text-primary">{matchResult.stake} ELM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total Pool</span>
                <span className="text-text-primary">{matchResult.totalPool} ELM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Rake ({RAKE_PERCENT}%)</span>
                <span className="text-energy-low">-{matchResult.rake} ELM</span>
              </div>
              {isWin && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Winner Payout</span>
                  <span className="text-energy-high font-bold">+{matchResult.winnerPayout} ELM</span>
                </div>
              )}
              {matchResult.boostStake > 0 && (
                <>
                  <div className="my-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Boost Stake</span>
                    <span className="text-text-primary">{matchResult.boostStake} ELM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Boost Status</span>
                    {matchResult.boostBurned ? (
                      <span className="text-energy-low font-bold"><FlameIcon size={14} className="inline" /> BURNED</span>
                    ) : matchResult.boostReturned ? (
                      <span className="text-energy-high font-bold"><CheckIcon size={14} className="inline" /> Returned</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </div>
                </>
              )}
              <div className="my-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex justify-between text-base font-bold">
                <span className="text-text-primary">Net Result</span>
                <span style={{ color: matchResult.elmEarned >= 0 ? '#22c55e' : '#ef4444' }}>
                  {matchResult.elmEarned >= 0 ? '+' : ''}{matchResult.elmEarned} ELM
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Round history */}
        {roundHistory.length > 0 && (
          <motion.div
            className="glass-card p-4 w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
              Round History
            </div>
            <div className="flex flex-col gap-1.5">
              {roundHistory.map((round) => (
                <div
                  key={round.round}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span className="text-text-muted text-xs">R{round.round}</span>
                  <div className="flex items-center gap-2">
                    <MoveIconDisplay id={round.myMove} size={20} />
                    <span className="text-text-muted">vs</span>
                    <MoveIconDisplay id={round.opponentMove} size={20} />
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      color: round.result === 'win' ? '#22c55e' : round.result === 'lose' ? '#ef4444' : '#eab308',
                      background: round.result === 'win' ? 'rgba(34,197,94,0.12)' : round.result === 'lose' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                    }}
                  >
                    {round.result.toUpperCase()}
                  </span>
                  <span className="text-xs text-text-muted inline-flex items-center gap-0.5">{round.myEnergyAfter}<BoltIcon size={10} /></span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          className="flex flex-col gap-3 w-full pb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <button
            data-nav
            className="btn-play w-full"
            onClick={handlePlayAgain}
          >
            <span className="flex items-center gap-2 justify-center">
              <SwordsIcon size={20} />
              Play Again
            </span>
          </button>
          <button
            data-nav
            className="btn-ghost w-full py-3 text-sm"
            onClick={handleHome}
          >
            <span className="flex items-center gap-2 justify-center">
              <HomeIcon size={16} />
              Back to Home
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
