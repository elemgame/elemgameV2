import React from 'react';
import { motion } from 'framer-motion';

interface EnergyBarProps {
  energy: number;
  maxEnergy?: number;
  showNumber?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getEnergyColor(percent: number): string {
  if (percent <= 33) return 'oklch(56% 0.19 31)';
  if (percent <= 66) return 'oklch(72% 0.15 82)';
  return 'oklch(57% 0.15 145)';
}

function getEnergyLabel(percent: number): string {
  if (percent <= 33) return 'LOW';
  if (percent <= 66) return 'MED';
  return 'HIGH';
}

function getEnergyGlow(percent: number): string {
  if (percent <= 33) return '0 8px 18px oklch(56% 0.19 31 / 0.28)';
  if (percent <= 66) return '0 8px 18px oklch(72% 0.15 82 / 0.28)';
  return '0 8px 18px oklch(57% 0.15 145 / 0.28)';
}

const SIZE_CONFIG = {
  sm: { trackH: 'h-1.5', text: 'text-xs', gap: 'gap-1' },
  md: { trackH: 'h-2.5', text: 'text-sm', gap: 'gap-1.5' },
  lg: { trackH: 'h-4', text: 'text-base', gap: 'gap-2' },
};

export function EnergyBar({
  energy,
  maxEnergy = 100,
  showNumber = true,
  label,
  size = 'md',
  className = '',
}: EnergyBarProps) {
  const clamped = Math.max(0, Math.min(maxEnergy, energy));
  const pct = (clamped / maxEnergy) * 100;
  const color = getEnergyColor(pct);
  const glow = getEnergyGlow(pct);
  const cfg = SIZE_CONFIG[size];

  return (
    <div className={`flex flex-col ${cfg.gap} ${className}`}>
      {(label || showNumber) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className={`${cfg.text} text-text-secondary font-medium`}>
              {label}
            </span>
          )}
          {showNumber && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs font-bold" style={{ color }}>
                {getEnergyLabel(pct)}
              </span>
              <span
                className={`${cfg.text} font-black tabular-nums`}
                style={{ color }}
              >
                {Math.max(0, energy)}
                <span className="text-text-muted font-normal text-xs">/{maxEnergy}</span>
              </span>
            </div>
          )}
        </div>
      )}

      <div
        className={`${cfg.trackH} rounded-full w-full overflow-hidden`}
        style={{
          background: 'oklch(11% 0.04 252 / 0.82)',
          border: '1px solid oklch(72% 0.04 73 / 0.58)',
          boxShadow: '0 2px 4px oklch(3% 0.02 252 / 0.48) inset, 0 1px 0 oklch(100% 0 0 / 0.08)',
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}, ${color})`,
            boxShadow: glow,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// Compact energy badge for showing opponent energy level
interface EnergyLevelBadgeProps {
  level: 'low' | 'medium' | 'high';
  className?: string;
}

export function EnergyLevelBadge({ level, className = '' }: EnergyLevelBadgeProps) {
  const config = {
    low: {
      label: 'LOW',
      color: '#ef4444',
      bg: 'oklch(20% 0.06 31 / 0.84)',
      border: 'oklch(56% 0.19 31 / 0.42)',
    },
    medium: {
      label: 'MED',
      color: '#eab308',
      bg: 'oklch(22% 0.055 82 / 0.84)',
      border: 'oklch(72% 0.15 82 / 0.45)',
    },
    high: {
      label: 'HIGH',
      color: '#22c55e',
      bg: 'oklch(22% 0.055 145 / 0.84)',
      border: 'oklch(57% 0.15 145 / 0.45)',
    },
  }[level];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${className}`}
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
}
