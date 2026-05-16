import React from 'react';
import { MoveId } from '@elmental/shared';
import { ElementIcon } from './ElementIcon';

type ArtSize = 'sm' | 'md' | 'lg' | 'xl';

const CARD_ART = import.meta.glob('../assets/cards/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const CARD_SIZE: Record<ArtSize, string> = {
  sm: 'h-7 w-5',
  md: 'h-10 w-8',
  lg: 'h-16 w-12',
  xl: 'h-24 w-16',
};

const ICON_SIZE: Record<ArtSize, 'sm' | 'md' | 'lg' | 'xl'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
};

const MOVE_ART_NAME: Record<MoveId, string> = {
  [MoveId.Earth]: 'Earth_Common.png',
  [MoveId.Fire]: 'Fire_Common.png',
  [MoveId.Water]: 'Water_Common.png',
  [MoveId.EarthPlus]: 'Earth_Epic.png',
  [MoveId.FirePlus]: 'Fire_Epic.png',
  [MoveId.WaterPlus]: 'Water_Epic.png',
};

export function getMoveArtUrl(moveId: MoveId): string | undefined {
  return CARD_ART[`../assets/cards/${MOVE_ART_NAME[moveId]}`];
}

export function MoveArt({
  moveId,
  size = 'md',
  className = '',
}: {
  moveId: MoveId | number;
  size?: ArtSize;
  className?: string;
}) {
  const normalizedMoveId = moveId as MoveId;
  const artUrl = getMoveArtUrl(normalizedMoveId);

  if (artUrl) {
    return (
      <img
        src={artUrl}
        alt=""
        className={`${CARD_SIZE[size]} rounded-md object-cover shadow-[0_0_10px_rgba(255,255,255,0.12)] ${className}`}
        draggable={false}
      />
    );
  }

  return <ElementIcon moveId={normalizedMoveId} size={ICON_SIZE[size]} className={className} />;
}
