import React from 'react';
import { motion } from 'framer-motion';
import { MoveId } from '@elmental/shared';

interface ElementIconProps {
  moveId: MoveId;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

const MOVE_ICONS: Record<MoveId, string> = {
  [MoveId.Earth]: '🪨',
  [MoveId.Fire]: '🔥',
  [MoveId.Water]: '💧',
  [MoveId.EarthPlus]: '⛰️',
  [MoveId.FirePlus]: '🌋',
  [MoveId.WaterPlus]: '🌊',
};

const SIZE_MAP = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
};

export function ElementIcon({
  moveId,
  size = 'md',
  animated = false,
  className = '',
}: ElementIconProps) {
  const icon = MOVE_ICONS[moveId];

  if (animated) {
    return (
      <motion.span
        className={`${SIZE_MAP[size]} ${className}`}
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {icon}
      </motion.span>
    );
  }

  return (
    <span className={`${SIZE_MAP[size]} ${className}`}>{icon}</span>
  );
}

// Standalone element icon for UI decorations
export function ElementBadge({
  moveId,
  className = '',
}: {
  moveId: MoveId;
  className?: string;
}) {
  const icon = MOVE_ICONS[moveId];
  return (
    <span className={`inline-flex items-center justify-center text-2xl ${className}`}>
      {icon}
    </span>
  );
}
