import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { GameMode } from '@elmental/shared';
import { haptic } from '../services/telegram';
import { playSound } from '../services/audio';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { SwordsIcon } from '../components/icons/SwordsIcon';
import { SkullIcon } from '../components/icons/SkullIcon';
import { VortexIcon } from '../components/icons/VortexIcon';
import { CheckIcon } from '../components/icons/CheckIcon';
import { BoltIcon } from '../components/icons/BoltIcon';
import { SoundIcon } from '../components/icons/SoundIcon';
import { EarthIcon } from '../components/icons/EarthIcon';
import { FireIcon } from '../components/icons/FireIcon';
import { WaterIcon } from '../components/icons/WaterIcon';
import { FlameIcon } from '../components/icons/FlameIcon';

const GAME_MODES = [
  {
    id: GameMode.Classic,
    label: 'Classic',
    renderIcon: (size: number) => <SwordsIcon size={size} className="text-water-light" />,
    desc: 'Win regen: +5, Lose regen: +15, Draw: +10',
    color: '#3b82f6',
  },
  {
    id: GameMode.Hardcore,
    label: 'Hardcore',
    renderIcon: (size: number) => <SkullIcon size={size} className="text-fire" />,
    desc: 'No energy regen: manage wisely',
    color: '#ef4444',
  },
  {
    id: GameMode.Chaos,
    label: 'Chaos',
    renderIcon: (size: number) => <VortexIcon size={size} className="text-purple-400" />,
    desc: 'Random regen 0-20 each round',
    color: '#a855f7',
  },
] as const;

interface ToggleRowProps {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon, label, desc, value, onChange }: ToggleRowProps) {
  return (
    <div className="arena-data-row flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center" style={{ width: 20, height: 20 }}>
          {icon}
        </span>
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
            ? 'linear-gradient(90deg, oklch(57% 0.15 145), oklch(78% 0.12 145))'
            : 'oklch(10% 0.035 252 / 0.7)',
          border: value ? '1px solid oklch(57% 0.15 145)' : '1px solid oklch(43% 0.055 252 / 0.68)',
          position: 'relative',
          flexShrink: 0,
        }}
        onClick={() => {
          haptic.selection();
          const next = !value;
          onChange(next);
          if (next) playSound('moveSelect');
        }}
      >
        <motion.div
          className="absolute top-0.5 w-6 h-6 rounded-full"
          style={{
            background: value ? 'oklch(14% 0.045 252)' : 'oklch(59% 0.035 86)',
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
    <div className="game-home-stage flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            data-nav
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'oklch(21% 0.045 252 / 0.9)', border: '1px solid oklch(43% 0.055 252 / 0.72)', boxShadow: '0 8px 18px oklch(3% 0.02 252 / 0.42)' }}
            onClick={() => setScreen('home')}
          >
            <ArrowLeftIcon size={18} className="text-text-secondary" />
          </button>
          <h1 className="text-xl font-black text-text-primary">Settings</h1>
        </div>

        {/* Game Mode */}
        <motion.div
          className="arena-page-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="arena-section-label mb-3">
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
                    borderColor: isSelected ? mode.color : 'oklch(43% 0.055 252 / 0.58)',
                    background: isSelected ? `${mode.color}20` : 'oklch(10% 0.035 252 / 0.46)',
                    boxShadow: isSelected ? `0 12px 24px ${mode.color}30` : '0 5px 12px oklch(3% 0.02 252 / 0.28)',
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    haptic.light();
                    setGameMode(mode.id);
                  }}
                >
                  <span className="flex items-center justify-center" style={{ width: 24, height: 24 }}>
                    {mode.renderIcon(24)}
                  </span>
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
                      className="flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <CheckIcon size={16} className="text-energy-high" />
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Gameplay toggles */}
        <motion.div
          className="arena-page-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="arena-section-label mb-1">
            Gameplay
          </div>
          <div>
            <ToggleRow
              icon={<BoltIcon size={20} className="text-gold" />}
              label="Energy Boost"
              desc="Start with +20 energy for +10% match cost"
              value={boostEnabled}
              onChange={setBoostEnabled}
            />
            <ToggleRow
              icon={<SoundIcon size={20} className="text-water-light" />}
              label="Sound Effects"
              desc="Game sounds and haptic feedback"
              value={soundEnabled}
              onChange={setSoundEnabled}
            />
          </div>
        </motion.div>

        {/* About */}
        <motion.div
          className="arena-page-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="arena-section-label mb-3">
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
              <span>Server</span>
              <span className="text-water font-medium">SpacetimeDB</span>
            </div>
          </div>

          <div
            className="mt-4 pt-4 border-t border-bg-border text-xs text-text-muted text-center"
          >
            Strategic elemental battles in realtime PvP.{'\n'}
            Rock-Paper-Scissors evolved.
          </div>
        </motion.div>

        {/* How to play */}
        <motion.div
          className="arena-page-section"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="arena-section-label mb-3">
            How to Play
          </div>
          <div className="flex flex-col gap-3 text-xs text-text-secondary">
            {[
              { icon: <EarthIcon size={16} className="text-earth-light" />, title: 'Earth beats Water; draws Water+', desc: 'Loses to Fire, Earth+ & Fire+' },
              { icon: <FireIcon size={16} className="text-fire" />, title: 'Fire beats Earth; draws Earth+', desc: 'Loses to Water, Fire+ & Water+' },
              { icon: <WaterIcon size={16} className="text-water-light" />, title: 'Water beats Fire; draws Fire+', desc: 'Loses to Earth, Earth+ & Water+' },
              { icon: <BoltIcon size={16} className="text-gold" />, title: 'Energy Management', desc: 'Basic: 10 | Enhanced: 25' },
              { icon: <FlameIcon size={16} className="text-fire" />, title: 'Enhanced Moves', desc: 'Stronger but more energy: use wisely' },
              { icon: <SkullIcon size={16} className="text-energy-low" />, title: 'Overclock', desc: '30% chance your move randomizes at low energy!' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
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
