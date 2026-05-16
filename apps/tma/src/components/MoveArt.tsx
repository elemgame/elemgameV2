import React from 'react';
import { MoveId } from '@elmental/shared';
import { ElementIcon } from './ElementIcon';

type ArtSize = 'sm' | 'md' | 'lg' | 'xl';

const ICON_SIZE: Record<ArtSize, 'sm' | 'md' | 'lg' | 'xl'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
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
  return <ElementIcon moveId={moveId as MoveId} size={ICON_SIZE[size]} className={className} />;
}
