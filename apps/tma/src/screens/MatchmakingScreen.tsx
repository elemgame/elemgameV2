import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { haptic } from '../services/telegram';
import { cancelMockMatchmaking } from '../services/mockGame';

const SEARCHING_MESSAGES = [
  'Finding opponent...',
  'Scanning the realm...',
  'Summoning challenger...',
  'Preparing arena...',
];

const ORBIT_ELEMENTS = ['🔥', '💧', '🪨'];

export function MatchmakingScreen() {
  const { rating, gameMode, cancelMatchmaking } = useGameStore();
  const [elapsed, setElapsed] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIdx((i) => (i + 1) % SEARCHING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(msgTimer);
  }, []);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const ratingMin = Math.max(0, rating - 100);
  const ratingMax = rating + 100;

  return (
    <div className="flex flex-col h-full items-center justify-center bg-game-bg p-6 gap-8">

      {/* Orbiting elements animation */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Central glow */}
        <motion.div
          className="w-20 h-20 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.3), transparent)',
            border: '2px solid rgba(59,130,246,0.2)',
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Orbit ring */}
        <motion.div
          className="absolute w-32 h-32 rounded-full"
          style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />

        {/* Orbiting element icons */}
        {ORBIT_ELEMENTS.map((icon, i) => (
          <motion.div
            key={i}
            className="absolute text-2xl"
            style={{
              transformOrigin: '64px 64px',
            }}
            animate={{ rotate: 360 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
              delay: i * (3 / ORBIT_ELEMENTS.length),
            }}
          >
            <span
              style={{
                display: 'block',
                transform: `translateX(56px)`,
              }}
            >
              {icon}
            </span>
          </motion.div>
        ))}

        {/* Center icon */}
        <motion.span
          className="text-3xl absolute"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          ⚔️
        </motion.span>
      </div>

      {/* Status message */}
      <div className="text-center">
        <motion.div
          key={msgIdx}
          className="text-xl font-bold text-text-primary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4 }}
        >
          {SEARCHING_MESSAGES[msgIdx]}
        </motion.div>
        <div className="text-sm text-text-secondary mt-1">
          Elapsed: {formatTime(elapsed)}
        </div>
      </div>

      {/* Search info card */}
      <motion.div
        className="glass-card p-4 w-full max-w-xs"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex justify-between items-center text-sm">
          <span className="text-text-secondary">Mode</span>
          <span className="font-bold text-water-light capitalize">{gameMode}</span>
        </div>
        <div
          className="my-3 h-px"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
        <div className="flex justify-between items-center text-sm">
          <span className="text-text-secondary">Your rating</span>
          <span className="font-bold text-text-primary">⭐ {rating}</span>
        </div>
        <div
          className="my-3 h-px"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
        <div className="flex justify-between items-center text-sm">
          <span className="text-text-secondary">Search range</span>
          <span className="font-bold text-text-primary">
            {ratingMin} — {ratingMax}
          </span>
        </div>
      </motion.div>

      {/* Animated dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ background: '#3b82f6' }}
            animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>

      {/* Cancel button */}
      <motion.button
        data-nav
        className="btn-ghost px-8 py-3 text-sm"
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          haptic.medium();
          cancelMockMatchmaking();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Cancel Search
      </motion.button>

      {/* Background particles */}
      {['⚡', '💫', '✨', '🔥', '💧'].map((p, i) => (
        <div
          key={i}
          className={`absolute text-2xl opacity-5 pointer-events-none particle-float-${(i % 5) + 1}`}
          style={{
            left: `${10 + i * 20}%`,
            top: `${15 + (i % 3) * 25}%`,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}
