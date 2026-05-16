import { describe, expect, it } from 'vitest';
import { playerAccountId, playerDisplayName, playerFullName } from './playerProfile';

describe('player profile display names', () => {
  it('uses the Telegram username as the primary display name', () => {
    expect(playerDisplayName({
      id: 1,
      first_name: 'Code',
      last_name: 'User',
      username: 'telegram_nick',
      source: 'telegram',
    })).toBe('telegram_nick');
  });

  it('falls back to Telegram first and last name when username is missing', () => {
    expect(playerDisplayName({
      id: 1,
      first_name: 'Code',
      last_name: 'User',
      source: 'telegram',
    })).toBe('Code User');
  });

  it('keeps web users on their editable display name', () => {
    expect(playerDisplayName({
      id: 2,
      first_name: 'Browser Player',
      username: 'browser_player',
      source: 'web',
    })).toBe('Browser Player');
  });

  it('normalizes Telegram usernames that already include @', () => {
    expect(playerDisplayName({
      id: 3,
      first_name: 'Code',
      username: ' @coded_user ',
      source: 'telegram',
    })).toBe('coded_user');
  });

  it('builds the full Telegram profile name separately for profile details', () => {
    expect(playerFullName({
      id: 4,
      first_name: 'Code',
      last_name: 'User',
      username: 'coded_user',
      source: 'telegram',
    })).toBe('Code User');
  });

  it('builds stable account ids from the profile source', () => {
    expect(playerAccountId({
      id: 777,
      first_name: 'Code',
      source: 'telegram',
    })).toBe('telegram:777');
    expect(playerAccountId({
      id: 888,
      first_name: 'Browser Player',
      source: 'web',
    })).toBe('web:888');
    expect(playerAccountId(null)).toBe('web:anonymous');
  });
});
