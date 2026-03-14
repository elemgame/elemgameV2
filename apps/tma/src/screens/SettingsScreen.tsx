import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { GameMode } from '@elmental/shared';
import { haptic } from '../services/telegram';

const GAME_MODES = [
  {
    id: GameMode.Classic,
    label: 'Classic',
    icon: '⚔️',
    desc: 'Win regen: +5, Lose regen: +15, Draw: +10',
    color: '#3b82f6',
  },
  {
    id: GameMode.Hardcore,
    label: 'Hardcore',
    icon: '💀',
    desc: 'No energy regen — manage wisely',
    color: '#ef4444',
  },
  {
    id: GameMode.Chaos,
    label: 'Chaos',
    icon: '🌀',
    desc: 'Random regen 0-20 each round',
    color: '#a855f7',
  },
] as const;

interface ToggleRowProps {
  icon: string;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon, label, desc, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="font-semibold text-sm text-text-primary">{label}</div>
          <div className="text-xs text-text-secondary">{desc}</div>
        </div>
      </div>
      <motion.button
        data-nav
        style={{
          width: '52px',
          height: '28px',
          borderRadius: '14px',
          background: value
            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
            : 'rgba(255,255,255,0.1)',
          border: value ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
          flexShrink: 0,
        }}
        onClick={() => {
          haptic.selection();
          onChange(!value);
        }}
      >
        <motion.div
          className="absolute top-0.5 w-6 h-6 rounded-full"
          style={{
            background: value ? '#000' : 'rgba(255,255,255,0.6)',
          }}
          animate={{ x: value ? 24 : 2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      </motion.button>
    </div>
  );
}

export function SettingsScreen() {
  const {
    gameMode,
    boostEnabled,
    soundEnabled,
    setGameMode,
    setBoostEnabled,
    setSoundEnabled,
    setScreen,
  } = useGameStore();

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-game-bg">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            data-nav
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setScreen('home')}
          >
            ←
          </button>
          <h1 className="text-xl font-black text-text-primary">Settings</h1>
        </div>

        {/* Game Mode */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Game Mode
          </div>
          <div className="flex flex-col gap-2">
            {GAME_MODES.map((mode) => {
              const isSelected = gameMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  data-nav
                  className="flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left"
                  style={{
                    borderColor: isSelected ? mode.color : 'rgba(255,255,255,0.06)',
                    background: isSelected ? `${mode.color}12` : 'rgba(255,255,255,0.02)',
                    boxShadow: isSelected ? `0 0 8px ${mode.color}30` : 'none',
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    haptic.light();
                    setGameMode(mode.id);
                  }}
                >
                  <span className="text-2xl">{mode.icon}</span>
                  <div className="flex-1">
                    <div
                      className="font-bold text-sm"
                      style={{ color: isSelected ? mode.color : '#f0f6fc' }}
                    >
                      {mode.label}
                    </div>
                    <div className="text-xs text-text-secondary">{mode.desc}</div>
                  </div>
                  {isSelected && (
                    <motion.span
                      className="text-base"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      ✅
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Gameplay toggles */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-1">
            Gameplay
          </div>
          <div className="divide-y divide-bg-border">
            <ToggleRow
              icon="⚡"
              label="Energy Boost"
              desc="Start with +20 energy for +10% stake"
              value={boostEnabled}
              onChange={setBoostEnabled}
            />
            <ToggleRow
              icon="🔊"
              label="Sound Effects"
              desc="Game sounds and haptic feedback"
              value={soundEnabled}
              onChange={setSoundEnabled}
            />
          </div>
        </motion.div>

        {/* About */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            About
          </div>
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="flex justify-between">
              <span>App</span>
              <span className="text-text-primary font-medium">Elmental TMA</span>
            </div>
            <div className="flex justify-between">
              <span>Version</span>
              <span className="text-text-primary font-medium">0.0.1</span>
            </div>
            <div className="flex justify-between">
              <span>Network</span>
              <span className="text-water font-medium">TON / Everscale</span>
            </div>
          </div>

          <div
            className="mt-4 pt-4 border-t border-bg-border text-xs text-text-muted text-center"
          >
            Strategic elemental battles on the blockchain.{'\n'}
            Rock-Paper-Scissors evolved.
          </div>
        </motion.div>

        {/* How to play */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            How to Play
          </div>
          <div className="flex flex-col gap-3 text-xs text-text-secondary">
            {[
              { icon: '🪨', title: 'Earth beats Fire & Water+', desc: 'Loses to Water & Fire+' },
              { icon: '🔥', title: 'Fire beats Water & Earth+', desc: 'Loses to Earth & Water+' },
              { icon: '💧', title: 'Water beats Earth & Fire+', desc: 'Loses to Fire & Earth+' },
              { icon: '⚡', title: 'Energy Management', desc: 'Basic: 10⚡ | Enhanced: 25⚡' },
              { icon: '🌋', title: 'Enhanced Moves', desc: 'Stronger but more energy — use wisely' },
              { icon: '⚠️', title: 'Overclock', desc: '30% chance your move randomizes at low energy!' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-2">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <div>
                  <div className="font-semibold text-text-primary">{item.title}</div>
                  <div>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
