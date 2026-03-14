import React from 'react';
import { motion } from 'framer-motion';
import { MoveId } from '@elmental/shared';
import { BASIC_MOVE_COST, ENHANCED_MOVE_COST } from '@elmental/shared';

interface MoveCardProps {
  moveId: MoveId;
  energy: number;
  selected?: boolean;
  disabled?: boolean;
  phase: 'select' | 'commit' | 'reveal' | 'result';
  onSelect: (moveId: MoveId) => void;
}

interface MoveConfig {
  icon: string;
  name: string;
  shortName: string;
  isEnhanced: boolean;
  cost: number;
  baseColor: string;
  gradientFrom: string;
  gradientTo: string;
  glowColor: string;
  borderColor: string;
  element: 'earth' | 'fire' | 'water';
}

const MOVE_CONFIG: Record<MoveId, MoveConfig> = {
  [MoveId.Earth]: {
    icon: '🪨',
    name: 'Earth',
    shortName: 'EARTH',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#a0522d',
    gradientFrom: '#5c2e0a',
    gradientTo: '#8b4513',
    glowColor: 'rgba(139,69,19,0.6)',
    borderColor: '#8b4513',
    element: 'earth',
  },
  [MoveId.Fire]: {
    icon: '🔥',
    name: 'Fire',
    shortName: 'FIRE',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#f87171',
    gradientFrom: '#7f1d1d',
    gradientTo: '#ef4444',
    glowColor: 'rgba(239,68,68,0.6)',
    borderColor: '#ef4444',
    element: 'fire',
  },
  [MoveId.Water]: {
    icon: '💧',
    name: 'Water',
    shortName: 'WATER',
    isEnhanced: false,
    cost: BASIC_MOVE_COST,
    baseColor: '#60a5fa',
    gradientFrom: '#1e3a8a',
    gradientTo: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.6)',
    borderColor: '#3b82f6',
    element: 'water',
  },
  [MoveId.EarthPlus]: {
    icon: '⛰️',
    name: 'Earth+',
    shortName: 'EARTH+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#5c2e0a',
    gradientTo: '#a0522d',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
    element: 'earth',
  },
  [MoveId.FirePlus]: {
    icon: '🌋',
    name: 'Fire+',
    shortName: 'FIRE+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#7f1d1d',
    gradientTo: '#dc2626',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
    element: 'fire',
  },
  [MoveId.WaterPlus]: {
    icon: '🌊',
    name: 'Water+',
    shortName: 'WATER+',
    isEnhanced: true,
    cost: ENHANCED_MOVE_COST,
    baseColor: '#ffd700',
    gradientFrom: '#1e3a8a',
    gradientTo: '#2563eb',
    glowColor: 'rgba(255,215,0,0.6)',
    borderColor: '#ffd700',
    element: 'water',
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
  const wouldOverclock = energy < 0 + cfg.cost && energy > 0;
  const isDisabled = externalDisabled || !canAfford || phase !== 'select';
  const isSelectable = !isDisabled;

  const borderColor = selected
    ? (cfg.isEnhanced ? '#ffd700' : cfg.borderColor)
    : cfg.isEnhanced
    ? 'rgba(255,215,0,0.5)'
    : 'rgba(255,255,255,0.1)';

  const boxShadow = selected
    ? `0 0 16px ${cfg.glowColor}, 0 0 32px ${cfg.glowColor}50`
    : cfg.isEnhanced
    ? '0 0 8px rgba(255,215,0,0.3)'
    : 'none';

  const background = selected
    ? `linear-gradient(135deg, ${cfg.gradientFrom}, ${cfg.gradientTo})`
    : `linear-gradient(135deg, ${cfg.gradientFrom}80, ${cfg.gradientTo}40)`;

  return (
    <motion.button
      data-nav
      data-nav-disabled={isDisabled ? 'true' : undefined}
      className={`
        relative flex flex-col items-center justify-center
        rounded-2xl border-2 p-2 gap-0.5
        transition-colors duration-150
        ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        borderColor,
        background,
        boxShadow,
        minHeight: '76px',
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
            background: 'linear-gradient(90deg, #cc9900, #ffd700, #cc9900)',
            color: '#000',
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
          style={{ background: '#ef4444', fontSize: '9px' }}
          title="May trigger overclock!"
        >
          !
        </div>
      )}

      {/* Icon */}
      <span className="text-2xl leading-none">{cfg.icon}</span>

      {/* Name */}
      <span
        className="text-xs font-bold tracking-wider leading-none"
        style={{ color: cfg.isEnhanced ? '#ffd700' : cfg.baseColor }}
      >
        {cfg.shortName}
      </span>

      {/* Cost */}
      <span
        className="text-xs font-semibold leading-none"
        style={{ color: canAfford ? 'rgba(255,255,255,0.6)' : '#ef4444' }}
      >
        {cfg.cost}⚡
      </span>
    </motion.button>
  );
}
