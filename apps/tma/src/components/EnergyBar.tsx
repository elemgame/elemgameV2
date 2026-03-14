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

function getEnergyColor(energy: number): string {
  if (energy <= 33) return '#ef4444'; // red
  if (energy <= 66) return '#eab308'; // yellow
  return '#22c55e'; // green
}

function getEnergyLabel(energy: number): string {
  if (energy <= 33) return 'LOW';
  if (energy <= 66) return 'MED';
  return 'HIGH';
}

function getEnergyGlow(energy: number): string {
  if (energy <= 33) return '0 0 8px rgba(239,68,68,0.6)';
  if (energy <= 66) return '0 0 8px rgba(234,179,8,0.6)';
  return '0 0 8px rgba(34,197,94,0.6)';
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
  const color = getEnergyColor(energy);
  const glow = getEnergyGlow(energy);
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
                {getEnergyLabel(energy)}
              </span>
              <span
                className={`${cfg.text} font-black tabular-nums`}
                style={{ color }}
              >
                {Math.max(0, energy)}
                <span className="text-text-muted font-normal text-xs">/{maxEnergy}</span>
              </span>
              <span className={`${cfg.text}`} style={{ color }}>⚡</span>
            </div>
          )}
        </div>
      )}

      <div
        className={`${cfg.trackH} rounded-full w-full overflow-hidden`}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
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
      label: 'LOW ⚡',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.15)',
      border: 'rgba(239,68,68,0.4)',
    },
    medium: {
      label: 'MED ⚡',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.15)',
      border: 'rgba(234,179,8,0.4)',
    },
    high: {
      label: 'HIGH ⚡',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.15)',
      border: 'rgba(34,197,94,0.4)',
    },
  }[level];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${className}`}
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
