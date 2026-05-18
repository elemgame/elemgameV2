import React, { useState } from 'react';
import { MoveId } from '@elmental/shared';
import { ElementIcon } from './ElementIcon';
import earthCommon from '../assets/cards/Earth_Common.png';
import earthEpic from '../assets/cards/Earth_Epic.png';
import fireCommon from '../assets/cards/Fire_Common.png';
import fireEpic from '../assets/cards/Fire_Epic.png';
import waterCommon from '../assets/cards/Water_Common.png';
import waterEpic from '../assets/cards/Water_Epic.png';

type ArtSize = 'sm' | 'md' | 'lg' | 'xl';

const CARD_MAP: Record<number, string> = {
  [MoveId.Earth]: earthCommon,
  [MoveId.Fire]: fireCommon,
  [MoveId.Water]: waterCommon,
  [MoveId.EarthPlus]: earthEpic,
  [MoveId.FirePlus]: fireEpic,
  [MoveId.WaterPlus]: waterEpic,
};

const PX: Record<ArtSize, number> = {
  sm: 48,
  md: 72,
  lg: 100,
  xl: 140,
};

export function MoveArt({
  moveId,
  size = 'md',
  className = '',
}: {
  moveId: MoveId | number;
  size?: ArtSize;
  className?: string;
}) {
  const [showFallback, setShowFallback] = useState(false);
  const imgSrc = CARD_MAP[moveId];

  if (!imgSrc || showFallback) {
    return <ElementIcon moveId={moveId as MoveId} size={size} className={className} />;
  }

  return (
    <img
      src={imgSrc}
      alt=""
      className={className}
      style={{ width: PX[size], height: PX[size], objectFit: 'contain' }}
      onError={() => setShowFallback(true)}
    />
  );
}
