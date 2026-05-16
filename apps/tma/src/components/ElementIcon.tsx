import React from 'react';
import { motion } from 'framer-motion';
import { MoveId } from '@elmental/shared';
import { EarthIcon } from './icons/EarthIcon';
import { FireIcon } from './icons/FireIcon';
import { WaterIcon } from './icons/WaterIcon';

interface ElementIconProps {
  moveId: MoveId;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

const SIZE_MAP: Record<string, number> = {
  sm: 18,
  md: 28,
  lg: 40,
  xl: 56,
};

function getIcon(moveId: MoveId, px: number, enhanced: boolean) {
  const cls = enhanced ? 'drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]' : '';
  switch (moveId) {
    case MoveId.Earth:
      return <EarthIcon size={px} className={`text-earth-light ${cls}`} />;
    case MoveId.Fire:
      return <FireIcon size={px} className={`text-fire ${cls}`} />;
    case MoveId.Water:
      return <WaterIcon size={px} className={`text-water-light ${cls}`} />;
    case MoveId.EarthPlus:
      return <EarthIcon size={px} className="text-gold drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]" />;
    case MoveId.FirePlus:
      return <FireIcon size={px} className="text-gold drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]" />;
    case MoveId.WaterPlus:
      return <WaterIcon size={px} className="text-gold drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]" />;
  }
}

export function ElementIcon({
  moveId,
  size = 'md',
  animated = false,
  className = '',
}: ElementIconProps) {
  const px = SIZE_MAP[size];
  const icon = getIcon(moveId, px, moveId >= MoveId.EarthPlus);

  if (animated) {
    return (
      <motion.span
        className={`inline-flex items-center justify-center ${className}`}
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {icon}
      </motion.span>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      {icon}
    </span>
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
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      {getIcon(moveId, 24, moveId >= MoveId.EarthPlus)}
    </span>
  );
}
