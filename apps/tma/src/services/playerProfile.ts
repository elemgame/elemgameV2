import type { PlayerProfileInput } from './gameProvider/types';

export function playerDisplayName(user?: PlayerProfileInput | null): string {
  if (!user) return 'Player';

  if (user.source === 'telegram') {
    const username = normalizedUsername(user.username);
    if (username) return username;
  }

  return playerFullName(user) || normalizedUsername(user.username) || 'Player';
}

export function playerFullName(user?: PlayerProfileInput | null): string {
  if (!user) return '';
  return `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`.trim();
}

function normalizedUsername(username?: string): string {
  return username?.trim().replace(/^@+/, '').slice(0, 32) ?? '';
}
