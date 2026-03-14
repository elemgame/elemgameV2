import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { GameMode } from '@elmental/shared';
import { haptic } from '../services/telegram';
import { startMockMatchmaking } from '../services/mockGame';

const GAME_MODES = [
  {
    id: GameMode.Classic,
    label: 'Classic',
    icon: '⚔️',
    desc: 'Energy regen on result',
    color: '#3b82f6',
  },
  {
    id: GameMode.Hardcore,
    label: 'Hardcore',
    icon: '💀',
    desc: 'No energy regen',
    color: '#ef4444',
  },
  {
    id: GameMode.Chaos,
    label: 'Chaos',
    icon: '🌀',
    desc: 'Random regen',
    color: '#a855f7',
  },
] as const;

export function HomeScreen() {
  const {
    telegramUser,
    elmBalance,
    rating,
    stats,
    gameMode,
    boostEnabled,
    setGameMode,
    setBoostEnabled,
    setScreen,
  } = useGameStore();

  const displayName = telegramUser
    ? `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ''}`
    : 'Player';

  const winRate =
    stats.wins + stats.losses > 0
      ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
      : 0;

  const stakeRequired = 100 + (boostEnabled ? 10 : 0);
  const canAffordMatch = elmBalance >= stakeRequired;

  const handlePlay = () => {
    if (!canAffordMatch) {
      haptic.error();
      return;
    }
    haptic.medium();
    startMockMatchmaking();
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-game-bg">
      <div className="flex flex-col gap-4 p-4 pb-6">

        {/* Header bar */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-black overflow-hidden border-2"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              {telegramUser?.photo_url ? (
                <img
                  src={telegramUser.photo_url}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="font-bold text-sm text-text-primary leading-tight">
                {displayName}
              </div>
              <div className="text-xs text-text-secondary">
                ⭐ {rating} Rating
              </div>
            </div>
          </div>

          {/* Top right actions */}
          <div className="flex gap-2">
            <button
              data-nav
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => setScreen('profile')}
            >
              👤
            </button>
            <button
              data-nav
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => setScreen('settings')}
            >
              ⚙️
            </button>
          </div>
        </motion.div>

        {/* ELM Balance card */}
        <motion.div
          className="glass-card p-5 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-1">
            ELM Balance
          </div>
          <motion.div
            className="glow-text-gold text-5xl font-black tabular-nums"
            animate={{ textShadow: ['0 0 10px rgba(255,215,0,0.4)', '0 0 20px rgba(255,215,0,0.7)', '0 0 10px rgba(255,215,0,0.4)'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            {elmBalance.toLocaleString()}
          </motion.div>
          <div className="text-xs text-text-secondary mt-1">tokens</div>

          {/* Win/Loss stats */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-bg-border">
            <div className="text-center">
              <div className="text-lg font-black text-energy-high">{stats.wins}</div>
              <div className="text-xs text-text-secondary">Wins</div>
            </div>
            <div
              className="w-px h-8"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
            <div className="text-center">
              <div className="text-lg font-black text-energy-low">{stats.losses}</div>
              <div className="text-xs text-text-secondary">Losses</div>
            </div>
            <div
              className="w-px h-8"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
            <div className="text-center">
              <div className="text-lg font-black text-water-light">{winRate}%</div>
              <div className="text-xs text-text-secondary">Win Rate</div>
            </div>
          </div>
        </motion.div>

        {/* Game Mode selector */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Game Mode
          </div>
          <div className="grid grid-cols-3 gap-2">
            {GAME_MODES.map((mode) => {
              const isSelected = gameMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  data-nav
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-colors"
                  style={{
                    borderColor: isSelected ? mode.color : 'rgba(255,255,255,0.08)',
                    background: isSelected
                      ? `${mode.color}18`
                      : 'rgba(255,255,255,0.03)',
                    boxShadow: isSelected ? `0 0 10px ${mode.color}40` : 'none',
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptic.light();
                    setGameMode(mode.id);
                  }}
                >
                  <span className="text-xl">{mode.icon}</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: isSelected ? mode.color : '#8b949e' }}
                  >
                    {mode.label}
                  </span>
                  <span className="text-[10px] text-text-muted text-center leading-tight">
                    {mode.desc}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Energy Boost toggle */}
        <motion.div
          className="glass-card p-4 flex items-center justify-between"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="font-bold text-sm text-text-primary">Energy Boost</div>
              <div className="text-xs text-text-secondary">
                Start with +20 energy (+10% stake)
              </div>
            </div>
          </div>
          <motion.button
            data-nav
            className="relative w-13 h-7 rounded-full transition-colors"
            style={{
              width: '52px',
              height: '28px',
              background: boostEnabled
                ? 'linear-gradient(90deg, #eab308, #ffd700)'
                : 'rgba(255,255,255,0.1)',
              border: boostEnabled ? '1px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
              boxShadow: boostEnabled ? '0 0 10px rgba(255,215,0,0.4)' : 'none',
            }}
            onClick={() => {
              haptic.selection();
              setBoostEnabled(!boostEnabled);
            }}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full"
              style={{
                background: boostEnabled ? '#000' : 'rgba(255,255,255,0.6)',
                bottom: '2px',
              }}
              animate={{ x: boostEnabled ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          </motion.button>
        </motion.div>

        {/* PLAY button */}
        <motion.div
          className="flex flex-col items-center gap-2 pt-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <motion.button
            data-nav
            className={`btn-play w-full text-center ${!canAffordMatch ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={!canAffordMatch ? { animation: 'none', filter: 'grayscale(0.5)' } : {}}
            whileTap={canAffordMatch ? { scale: 0.96 } : {}}
            onClick={handlePlay}
          >
            {canAffordMatch ? '⚔️ PLAY NOW' : '💸 NOT ENOUGH ELM'}
          </motion.button>
          <div className="text-xs text-text-muted">
            {canAffordMatch
              ? `Stake: ${stakeRequired} ELM • ${gameMode} mode`
              : `Need ${stakeRequired} ELM (have ${elmBalance})`}
          </div>
        </motion.div>

        {/* Floating element decorations */}
        <div className="absolute top-20 right-4 text-3xl opacity-10 particle-float-1 pointer-events-none">
          🔥
        </div>
        <div className="absolute top-40 left-2 text-2xl opacity-10 particle-float-3 pointer-events-none">
          💧
        </div>
      </div>
    </div>
  );
}
