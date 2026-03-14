import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LastRoundResult } from '../stores/gameStore';

interface RoundResultProps {
  result: LastRoundResult | null;
  visible: boolean;
  onDismiss: () => void;
}

const MOVE_ICONS: Record<number, string> = {
  0: '🪨', 1: '🔥', 2: '💧',
  3: '⛰️', 4: '🌋', 5: '🌊',
};

const MOVE_NAMES: Record<number, string> = {
  0: 'Earth', 1: 'Fire', 2: 'Water',
  3: 'Earth+', 4: 'Fire+', 5: 'Water+',
};

export function RoundResult({ result, visible, onDismiss }: RoundResultProps) {
  if (!result) return null;

  const isWin = result.result === 'win';
  const isDraw = result.result === 'draw';

  const resultConfig = {
    win: {
      text: 'YOU WIN!',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.3)',
      glow: '0 0 30px rgba(34,197,94,0.4)',
      emoji: '⚡',
    },
    lose: {
      text: 'YOU LOSE',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.3)',
      glow: '0 0 30px rgba(239,68,68,0.4)',
      emoji: '💀',
    },
    draw: {
      text: 'DRAW',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.3)',
      glow: '0 0 30px rgba(234,179,8,0.4)',
      emoji: '🤝',
    },
  }[result.result];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            className="mx-4 p-5 rounded-3xl flex flex-col items-center gap-4 w-full max-w-xs"
            style={{
              background: resultConfig.bg,
              border: `2px solid ${resultConfig.border}`,
              boxShadow: resultConfig.glow,
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Result text */}
            <motion.div
              className="text-4xl font-black tracking-wider text-center"
              style={{ color: resultConfig.color, textShadow: `0 0 20px ${resultConfig.color}` }}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {resultConfig.emoji} {resultConfig.text}
            </motion.div>

            {/* Card clash visualization */}
            <motion.div
              className="flex items-center gap-4 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {/* My move */}
              <motion.div
                className="flex-1 flex flex-col items-center gap-1 p-3 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
              >
                <span className="text-xs text-text-secondary font-semibold">YOU</span>
                <span className="text-4xl">{MOVE_ICONS[result.myMove]}</span>
                <span className="text-xs font-bold text-text-primary">{MOVE_NAMES[result.myMove]}</span>
              </motion.div>

              {/* VS */}
              <motion.div
                className="flex flex-col items-center"
                animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <span className="text-2xl font-black text-text-secondary">VS</span>
              </motion.div>

              {/* Opponent move */}
              <motion.div
                className="flex-1 flex flex-col items-center gap-1 p-3 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
              >
                <span className="text-xs text-text-secondary font-semibold">OPP</span>
                <span className="text-4xl">{MOVE_ICONS[result.opponentMove]}</span>
                <span className="text-xs font-bold text-text-primary">{MOVE_NAMES[result.opponentMove]}</span>
              </motion.div>
            </motion.div>

            {/* Overclock warning */}
            {result.wasOverclocked && (
              <motion.div
                className="text-xs text-center px-3 py-1.5 rounded-full font-semibold"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                ⚠️ OVERCLOCK — move was randomized!
              </motion.div>
            )}

            {/* Energy after */}
            <motion.div
              className="text-sm text-text-secondary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Your energy: <span className="font-bold text-text-primary">{result.myEnergyAfter}⚡</span>
            </motion.div>

            {/* Tap to continue */}
            <motion.button
              className="text-xs text-text-muted"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              onClick={onDismiss}
            >
              Tap anywhere to continue
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
