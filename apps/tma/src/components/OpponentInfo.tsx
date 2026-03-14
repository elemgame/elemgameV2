import React from 'react';
import { motion } from 'framer-motion';
import { EnergyLevelBadge } from './EnergyBar';
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
      className={`flex items-center justify-between p-3 rounded-2xl ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Avatar + Name */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black"
          style={{
            background: 'linear-gradient(135deg, #ef4444, #7c3aed)',
            color: '#fff',
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-text-primary text-sm leading-tight truncate max-w-[130px]">
            {name}
          </div>
          <div className="text-xs text-text-secondary">⭐ {rating}</div>
        </div>
      </div>

      {/* Energy level badge */}
      <EnergyLevelBadge level={energyLevel} />
    </motion.div>
  );
}
