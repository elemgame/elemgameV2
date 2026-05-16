import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMockUser,
  sanitizeWebUserName,
  saveWebUser,
  userNameFromDisplayName,
} from './telegram';

describe('web user profile helpers', () => {
  beforeEach(() => {
    setMockWindow('');
  });

  it('sanitizes web display names for SpacetimeDB profile limits', () => {
    expect(sanitizeWebUserName('  Alice    Web  ')).toBe('Alice Web');
    expect(sanitizeWebUserName('x'.repeat(40))).toBe('x'.repeat(32));
    expect(sanitizeWebUserName('     ')).toBe('');
  });

  it('derives stable browser handles from display names', () => {
    expect(userNameFromDisplayName('Alice Web')).toBe('alice_web');
    expect(userNameFromDisplayName(' A!B@C# ')).toBe('a_b_c');
    expect(userNameFromDisplayName('***')).toBe('player');
  });

  it('stores normalized web users in local and session storage', () => {
    const { localStorage, sessionStorage } = setMockWindow('');

    const saved = saveWebUser({
      id: 123456789,
      first_name: '  Ilya   Web  ',
    });

    expect(saved).toEqual({
      id: 123456789,
      first_name: 'Ilya Web',
      last_name: undefined,
      username: 'ilya_web',
      photo_url: undefined,
    });
    expect(JSON.parse(localStorage.getItem('elmental.webUser') ?? '{}')).toEqual({
      id: saved.id,
      first_name: saved.first_name,
      username: saved.username,
    });
    expect(JSON.parse(sessionStorage.getItem('elmental.devUser') ?? '{}')).toEqual({
      id: saved.id,
      first_name: saved.first_name,
      username: saved.username,
    });
  });

  it('creates deterministic URL-param web users without mutating storage', () => {
    const { localStorage, sessionStorage } = setMockWindow('?player=Alice%20Web');

    const first = getMockUser();
    const second = getMockUser();

    expect(first).toEqual(second);
    expect(first.first_name).toBe('Alice Web');
    expect(first.username).toBe('alice_web');
    expect(localStorage.getItem('elmental.webUser')).toBeNull();
    expect(sessionStorage.getItem('elmental.webUser')).toBeNull();
  });

  it('loads a saved browser user when no URL player is provided', () => {
    const { localStorage } = setMockWindow('');
    localStorage.setItem('elmental.webUser', JSON.stringify({
      id: 987654321,
      first_name: 'Saved Player',
    }));

    expect(getMockUser()).toMatchObject({
      id: 987654321,
      first_name: 'Saved Player',
      username: 'saved_player',
    });
  });

  it('falls back to a generated player when stored data is invalid', () => {
    const { localStorage } = setMockWindow('');
    localStorage.setItem('elmental.webUser', '{bad json');

    const user = getMockUser();

    expect(user.id).toBeGreaterThanOrEqual(100_000_000);
    expect(user.first_name).toMatch(/^Player\d{4}$/);
    expect(localStorage.getItem('elmental.webUser')).toContain(user.first_name);
  });
});

function setMockWindow(search: string) {
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { search },
      localStorage,
      sessionStorage,
    },
    configurable: true,
    writable: true,
  });

  return { localStorage, sessionStorage };
}

function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: vi.fn(() => data.clear()),
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(data.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, String(value));
    }),
  };
}
