import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { MoveId } from '@elmental/shared';
import { EnergyBar } from '../components/EnergyBar';
import { MoveCard } from '../components/MoveCard';
import { Timer } from '../components/Timer';
import { OpponentInfo } from '../components/OpponentInfo';
import { RoundResult } from '../components/RoundResult';
import { commitMove, generateMoveCommit, generateSalt } from '../services/socket';
import { haptic } from '../services/telegram';

const MOVE_IDS: MoveId[] = [
  MoveId.Earth, MoveId.Fire, MoveId.Water,
  MoveId.EarthPlus, MoveId.FirePlus, MoveId.WaterPlus,
];

const PHASE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  select: { text: 'Select Move', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  commit: { text: 'Waiting...', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  reveal: { text: 'Revealing!', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  result: { text: 'Round Result', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
};

export function MatchScreen() {
  const {
    matchId,
    opponentName,
    opponentRating,
    myEnergy,
    opponentEnergyLevel,
    myScore,
    opponentScore,
    currentRound,
    roundPhase,
    selectedMove,
    roundTimer,
    lastRoundResult,
    selectMove,
    setRoundPhase,
    advanceRound,
    setRoundTimer,
    resetMatch,
    setScreen,
  } = useGameStore();

  const [showRoundResult, setShowRoundResult] = useState(false);
  const saltRef = useRef<string>('');

  // Show result overlay when phase becomes 'result'
  useEffect(() => {
    if (roundPhase === 'result') {
      haptic.success();
      setShowRoundResult(true);
    }
  }, [roundPhase]);

  // Local countdown timer (server ticks override via socket)
  useEffect(() => {
    if (roundPhase !== 'select') return;
    const interval = setInterval(() => {
      setRoundTimer(Math.max(0, roundTimer - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [roundPhase, roundTimer, setRoundTimer]);

  const handleMoveSelect = async (moveId: MoveId) => {
    if (!matchId || roundPhase !== 'select') return;
    haptic.medium();

    // Generate salt and commit hash
    const salt = generateSalt();
    saltRef.current = salt;
    const hash = await generateMoveCommit(moveId, salt);

    selectMove(moveId);
    commitMove(matchId, hash);
  };

  const handleDismissResult = () => {
    setShowRoundResult(false);
    // After dismissing result overlay, advance to next round or let match end
    if (roundPhase === 'result') {
      advanceRound();
    }
  };

  const handleForfeit = () => {
    haptic.warning();
    resetMatch();
    setScreen('home');
  };

  const phaseInfo = PHASE_LABELS[roundPhase] ?? PHASE_LABELS.select;

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0d0d2b 0%, #0a0a1a 100%)' }}
    >
      {/* ── TOP BAR ──────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Round info */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary font-semibold">ROUND</span>
          <span className="text-lg font-black text-text-primary">{currentRound}</span>
        </div>

        {/* Score */}
        <motion.div
          className="flex items-center gap-3 text-2xl font-black"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 0.3, repeat: 0 }}
          key={`${myScore}-${opponentScore}`}
        >
          <span className="text-energy-high">{myScore}</span>
          <span className="text-text-muted text-lg">:</span>
          <span className="text-energy-low">{opponentScore}</span>
        </motion.div>

        {/* Timer */}
        <Timer
          seconds={roundTimer}
          maxSeconds={15}
          size={44}
          strokeWidth={3}
        />
      </div>

      {/* ── OPPONENT SECTION ─────────────────────────── */}
      <div className="px-4 pt-3">
        <OpponentInfo
          name={opponentName}
          rating={opponentRating}
          energyLevel={opponentEnergyLevel}
        />
      </div>

      {/* ── VS DIVIDER ───────────────────────────────── */}
      <div className="relative flex items-center justify-center py-3">
        <div
          className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}
        />
        <motion.div
          className="relative z-10 flex items-center gap-2 px-4 py-1 rounded-full text-xs font-bold"
          style={{
            background: phaseInfo.bg,
            border: `1px solid ${phaseInfo.color}40`,
            color: phaseInfo.color,
          }}
          key={roundPhase}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <motion.span
            animate={roundPhase === 'commit' ? { rotate: 360 } : { rotate: 0 }}
            transition={roundPhase === 'commit' ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
          >
            {roundPhase === 'select' ? '⚔️' :
             roundPhase === 'commit' ? '⏳' :
             roundPhase === 'reveal' ? '👁️' : '📊'}
          </motion.span>
          {phaseInfo.text}
        </motion.div>
      </div>

      {/* ── MY ENERGY BAR ────────────────────────────── */}
      <div className="px-4">
        <EnergyBar
          energy={myEnergy}
          maxEnergy={100}
          showNumber
          label="Your Energy"
          size="lg"
        />
      </div>

      {/* ── MOVE GRID ────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-end px-4 pb-4 pt-3 gap-2">
        {/* Phase hint */}
        <AnimatePresence mode="wait">
          {roundPhase === 'select' ? (
            <motion.div
              key="select-hint"
              className="text-center text-xs text-text-secondary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Choose wisely — your opponent is watching your energy level
            </motion.div>
          ) : roundPhase === 'commit' ? (
            <motion.div
              key="commit-hint"
              className="text-center text-xs"
              style={{ color: '#eab308' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Move committed — waiting for opponent...
            </motion.div>
          ) : (
            <motion.div key="empty-hint" />
          )}
        </AnimatePresence>

        {/* 2-row move grid: Row 1 basic (0-2), Row 2 enhanced (3-5) */}
        <div className="flex flex-col gap-2">
          {/* Row 1: Basic moves */}
          <div className="grid grid-cols-3 gap-2">
            {MOVE_IDS.slice(0, 3).map((moveId) => (
              <MoveCard
                key={moveId}
                moveId={moveId}
                energy={myEnergy}
                selected={selectedMove === moveId}
                phase={roundPhase}
                onSelect={handleMoveSelect}
              />
            ))}
          </div>

          {/* Row 2: Enhanced moves */}
          <div className="grid grid-cols-3 gap-2">
            {MOVE_IDS.slice(3, 6).map((moveId) => (
              <MoveCard
                key={moveId}
                moveId={moveId}
                energy={myEnergy}
                selected={selectedMove === moveId}
                phase={roundPhase}
                onSelect={handleMoveSelect}
              />
            ))}
          </div>
        </div>

        {/* Forfeit button */}
        <div className="flex justify-center pt-1">
          <button
            data-nav
            className="text-xs text-text-muted px-3 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            onClick={handleForfeit}
          >
            Forfeit match
          </button>
        </div>
      </div>

      {/* ── ROUND RESULT OVERLAY ─────────────────────── */}
      <RoundResult
        result={lastRoundResult}
        visible={showRoundResult}
        onDismiss={handleDismissResult}
      />
    </div>
  );
}
