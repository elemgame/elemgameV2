import React from 'react';
import { motion } from 'framer-motion';
import { MoveId } from '@elmental/shared';
import { BASIC_MOVE_COST, ENHANCED_MOVE_COST } from '@elmental/shared';
import { BoltIcon } from './icons/BoltIcon';
import { MoveArt } from './MoveArt';

interface MoveCardProps {
  moveId: MoveId;
  energy: number;
  selected?: boolean;
  disabled?: boolean;
  phase: 'select' | 'commit' | 'reveal' | 'result';
  onSelect: (moveId: MoveId) => void;
}

interface MoveConfig {
  name: string;
  shortName: string;
  isEnhanced: boolean;
  cost: number;
  baseColor: string;
  gradientFrom: string;
  gradientTo: string;
  glowColor: string;
  borderColor: string;
}

const MOVE_CONFIG: Record<MoveId, MoveConfig> = {
  [MoveId.Earth]: {
    name: 'Earth',
    shortName: 'EARTH',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#a0522d',
    gradientFrom: '#5c2e0a',
    gradientTo: '#8b4513',
    glowColor: 'rgba(139,69,19,0.6)',
    borderColor: '#8b4513',
  },
  [MoveId.Fire]: {
    name: 'Fire',
    shortName: 'FIRE',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#f87171',
    gradientFrom: '#7f1d1d',
    gradientTo: '#ef4444',
    glowColor: 'rgba(239,68,68,0.6)',
    borderColor: '#ef4444',
  },
  [MoveId.Water]: {
    name: 'Water',
    shortName: 'WATER',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#60a5fa',
    gradientFrom: '#1e3a8a',
    gradientTo: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.6)',
    borderColor: '#3b82f6',
  },
  [MoveId.EarthPlus]: {
    name: 'Earth+',
    shortName: 'EARTH+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#5c2e0a',
    gradientTo: '#a0522d',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
  },
  [MoveId.FirePlus]: {
    name: 'Fire+',
    shortName: 'FIRE+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#7f1d1d',
    gradientTo: '#dc2626',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
  },
  [MoveId.WaterPlus]: {
    name: 'Water+',
    shortName: 'WATER+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#1e3a8a',
    gradientTo: '#2563eb',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
  },
};

export function MoveCard({
  moveId,
  energy,
  selected = false,
  disabled: externalDisabled = false,
  phase,
  onSelect,
}: MoveCardProps) {
  const cfg = MOVE_CONFIG[moveId];
  const canAfford = energy >= cfg.cost;
  const wouldOverclock = !canAfford && energy >= 0;
  // Allow overclock moves when energy is non-negative but below cost.
  const isDisabled = externalDisabled || energy < 0 || phase !== 'select';
  const isSelectable = !isDisabled;

  const borderColor = selected
    ? (cfg.isEnhanced ? '#ffd700' : cfg.borderColor)
    : cfg.isEnhanced
    ? 'oklch(78% 0.15 83 / 0.72)'
    : 'oklch(72% 0.04 73 / 0.72)';

  const boxShadow = selected
    ? `0 16px 28px ${cfg.glowColor}, 0 1px 0 oklch(100% 0 0 / 0.16) inset`
    : cfg.isEnhanced
    ? '0 12px 24px oklch(78% 0.15 83 / 0.24), 0 1px 0 oklch(100% 0 0 / 0.14) inset'
    : '0 10px 20px oklch(3% 0.02 252 / 0.34), 0 1px 0 oklch(100% 0 0 / 0.12) inset';

  const background = selected
    ? `linear-gradient(135deg, ${cfg.gradientFrom}, ${cfg.gradientTo})`
    : `linear-gradient(180deg, oklch(24% 0.045 252 / 0.82), oklch(13% 0.04 252 / 0.9)), linear-gradient(135deg, ${cfg.gradientFrom}, ${cfg.gradientTo})`;

  return (
    <motion.button
      data-nav
      data-nav-disabled={isDisabled ? 'true' : undefined}
      className={`
        relative flex flex-col items-center justify-center
        rounded-xl border-2 p-2 gap-0.5
        transition-colors duration-150
        ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        borderColor,
        background,
        boxShadow,
        minHeight: '86px',
        filter: isDisabled ? 'grayscale(0.5)' : 'none',
      }}
      whileHover={isSelectable ? { scale: 1.04, y: -2 } : {}}
      whileTap={isSelectable ? { scale: 0.96 } : {}}
      animate={selected ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.15 }}
      onClick={() => {
        if (isSelectable) onSelect(moveId);
      }}
      disabled={isDisabled}
    >
      {/* Enhanced crown indicator */}
      {cfg.isEnhanced && (
        <div
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-xs px-2 py-0.5 rounded-full font-black"
          style={{
            background: 'linear-gradient(90deg, oklch(55% 0.13 75), oklch(88% 0.12 87), oklch(55% 0.13 75))',
            color: 'oklch(24% 0.035 70)',
            fontSize: '9px',
            letterSpacing: '0.05em',
          }}
        >
          ENHANCED
        </div>
      )}

      {/* Overclock warning indicator */}
      {wouldOverclock && !isDisabled && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs"
        style={{ background: 'oklch(56% 0.19 31)', color: 'oklch(98% 0.008 248)', fontSize: '9px' }}
          title="May trigger overclock!"
        >
          !
        </div>
      )}

      {/* Icon */}
      <span className="flex items-center justify-center" style={{ height: 32, width: 32 }}>
        <MoveArt moveId={moveId} size="sm" />
      </span>

      {/* Name */}
      <span
        className="text-xs font-bold tracking-wider leading-none"
        style={{ color: selected ? 'oklch(98% 0.008 248)' : cfg.baseColor }}
      >
        {cfg.shortName}
      </span>

      {/* Cost */}
      <span
        className="text-xs font-semibold leading-none"
        style={{ color: canAfford ? (selected ? 'oklch(98% 0.008 248 / 0.82)' : 'oklch(76% 0.026 86)') : 'oklch(66% 0.17 33)' }}
      >
        <BoltIcon size={11} className="mr-0.5" />
        {cfg.cost}
      </span>
    </motion.button>
  );
}
