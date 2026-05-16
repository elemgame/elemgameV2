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

export function playerAccountId(user?: PlayerProfileInput | null): string {
  if (!user) return 'web:anonymous';
  const source = user.source === 'telegram' ? 'telegram' : 'web';
  return `${source}:${user.id}`;
}

function normalizedUsername(username?: string): string {
  return username?.trim().replace(/^@+/, '').slice(0, 32) ?? '';
}
