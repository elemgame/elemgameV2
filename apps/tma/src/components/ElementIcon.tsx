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
  let icon: React.ReactNode;
  switch (moveId) {
    case MoveId.Earth:
    case MoveId.EarthPlus:
      icon = <EarthIcon size={px} className="text-earth-light" />;
      break;
    case MoveId.Fire:
    case MoveId.FirePlus:
      icon = <FireIcon size={px} className="text-fire" />;
      break;
    case MoveId.Water:
    case MoveId.WaterPlus:
      icon = <WaterIcon size={px} className="text-water-light" />;
      break;
  }

  if (enhanced) {
    return (
      <span className="relative inline-flex items-center justify-center">
        {icon}
        <span className="absolute -top-1 -right-1 text-[10px] font-bold text-gold drop-shadow-[0_0_2px_rgba(0,0,0,0.5)] leading-none">+</span>
      </span>
    );
  }

  return icon;
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
