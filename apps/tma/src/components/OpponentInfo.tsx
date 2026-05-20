import React from 'react';
import { motion } from 'framer-motion';
import { EnergyLevelBadge } from './EnergyBar';
import { TrophyIcon } from './icons/TrophyIcon';
import type { EnergyLevel } from '../stores/gameStore';

interface OpponentInfoProps {
  name: string;
  rating: number;
  energyLevel: EnergyLevel;
  className?: string;
}

export function OpponentInfo({
  name,
  rating,
  energyLevel,
  className = '',
}: OpponentInfoProps) {
  return (
    <motion.div
      className={`flex items-center justify-between rounded-lg p-3 ${className}`}
      style={{
        background: 'oklch(21% 0.045 252 / 0.86)',
        border: '1px solid oklch(43% 0.055 252 / 0.68)',
        boxShadow: '0 12px 24px oklch(3% 0.02 252 / 0.38), 0 1px 0 oklch(100% 0 0 / 0.1) inset',
      }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black"
          style={{
            background: 'linear-gradient(135deg, oklch(66% 0.17 33), oklch(68% 0.135 238))',
            color: 'oklch(98% 0.008 248)',
            boxShadow: '0 8px 18px oklch(56% 0.19 31 / 0.22)',
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-text-primary text-sm leading-tight truncate max-w-[130px]">
            {name}
          </div>
          <div className="text-xs text-text-secondary flex items-center gap-0.5">
            <TrophyIcon size={12} className="text-gold" /> {rating}
          </div>
        </div>
      </div>

      {/* Energy level badge */}
      <EnergyLevelBadge level={energyLevel} />
    </motion.div>
  );
}
