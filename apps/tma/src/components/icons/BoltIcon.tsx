import { Lightning } from '@phosphor-icons/react';
import type { IconProps } from '@phosphor-icons/react';

export function BoltIcon({ className = '', size = 24, ...rest }: Partial<IconProps>) {
  return (
    <Lightning
      weight="fill"
      size={size}
      className={`drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)] ${className}`}
      {...rest}
    />
  );
}
