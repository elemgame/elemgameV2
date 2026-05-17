/**
 * Telegram Mini App SDK helpers.
 * Provides safe access to the TWA SDK (works in both browser and Telegram).
 */

interface SafeAreaInset {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  isFullscreen?: boolean;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setText(text: string): void;
    setParams(params: Record<string, unknown>): void;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(eventType: string, cb: (event?: unknown) => void): void;
  offEvent(eventType: string, cb: (event?: unknown) => void): void;
  sendData(data: string): void;
  openLink(url: string): void;
  openInvoice?(url: string, cb?: (status: string) => void): void;
  openTelegramLink(url: string): void;
  showPopup(params: unknown, cb?: (button_id: string) => void): void;
  showAlert(message: string, cb?: () => void): void;
  showConfirm(message: string, cb?: (confirmed: boolean) => void): void;
}

export interface WebUserProfile {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

const WEB_USER_STORAGE_KEY = 'elmental.webUser';
const LEGACY_WEB_USER_STORAGE_KEY = 'elmental.devUser';

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Returns the Telegram WebApp object, or null when running outside Telegram.
 */
export function getTelegramWebApp(): TelegramWebApp | null {
  const app = getTelegramRuntime();
  if (!app) return null;
  if (!app.initData && !app.initDataUnsafe?.user && !getTelegramInitDataFromHash()) return null;
  return app;
}

function getTelegramRuntime(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/**
 * Initialize the TWA: call ready() and expand().
 */
export function initTelegram(): void {
  const twa = getTelegramRuntime();
  if (!twa) return;
  try {
    twa.ready();
    twa.expand();
    twa.setHeaderColor?.('#0a0a1a');
    twa.setBackgroundColor?.('#0a0a1a');
    twa.setBottomBarColor?.('#0a0a1a');
  } catch {
    // swallow — not critical
  }
}

export function installTelegramViewportSync(): () => void {
  const twa = getTelegramRuntime();
  if (!twa || typeof document === 'undefined') return () => {};

  const applyViewport = () => {
    const root = document.documentElement;
    const viewportHeight = Math.round(twa.viewportStableHeight || twa.viewportHeight || window.innerHeight || 0);
    if (viewportHeight > 0) {
      root.style.setProperty('--elmental-js-viewport-height', `${viewportHeight}px`);
    }

    const safe = twa.safeAreaInset ?? {};
    const contentSafe = twa.contentSafeAreaInset ?? {};
    root.style.setProperty('--elmental-js-safe-top', `${Math.max(toInset(safe.top), toInset(contentSafe.top))}px`);
    root.style.setProperty('--elmental-js-safe-right', `${Math.max(toInset(safe.right), toInset(contentSafe.right))}px`);
    root.style.setProperty('--elmental-js-safe-bottom', `${Math.max(toInset(safe.bottom), toInset(contentSafe.bottom))}px`);
    root.style.setProperty('--elmental-js-safe-left', `${Math.max(toInset(safe.left), toInset(contentSafe.left))}px`);
  };

  const events = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'];
  for (const event of events) twa.onEvent(event, applyViewport);

  applyViewport();
  const timers = [window.setTimeout(applyViewport, 100), window.setTimeout(applyViewport, 600)];

  return () => {
    for (const event of events) twa.offEvent(event, applyViewport);
    for (const timer of timers) window.clearTimeout(timer);
  };
}

function toInset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Get the Telegram user from initDataUnsafe.
 * Returns null when running outside Telegram.
 */
export function getTelegramUser() {
  const twa = getTelegramWebApp();
  if (!twa) return null;
  return twa.initDataUnsafe?.user ?? parseTelegramUserFromInitData(twa.initData || getTelegramInitDataFromHash());
}

/**
 * Raw signed Telegram initData used by the backend auth endpoint.
 */
export function getTelegramInitData(): string {
  const twa = getTelegramWebApp();
  if (!twa) return '';
  return twa.initData || getTelegramInitDataFromHash();
}

function getTelegramInitDataFromHash(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash?.replace(/^#/, '') ?? '';
  if (!hash) return '';
  const params = new URLSearchParams(hash);
  return params.get('tgWebAppData') ?? '';
}

function parseTelegramUserFromInitData(initData: string): WebUserProfile | null {
  if (!initData) return null;
  try {
    const rawUser = new URLSearchParams(initData).get('user');
    if (!rawUser) return null;
    const user = JSON.parse(rawUser) as Partial<WebUserProfile>;
    if (typeof user.id !== 'number' || typeof user.first_name !== 'string') return null;
    return {
      id: user.id,
      first_name: user.first_name,
      last_name: typeof user.last_name === 'string' ? user.last_name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
      photo_url: typeof user.photo_url === 'string' ? user.photo_url : undefined,
      language_code: typeof user.language_code === 'string' ? user.language_code : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Haptic feedback helpers (no-op outside Telegram).
 */
export const haptic = {
  light: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('light'),
  medium: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('medium'),
  heavy: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('heavy'),
  success: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('success'),
  error: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('error'),
  warning: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('warning'),
  selection: () => getTelegramWebApp()?.HapticFeedback.selectionChanged(),
};

/**
 * Show a native Telegram alert.
 */
export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const twa = getTelegramWebApp();
    if (!twa) {
      alert(message);
      resolve();
      return;
    }
    twa.showAlert(message, resolve);
  });
}

/**
 * Show a native Telegram confirmation dialog.
 */
export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const twa = getTelegramWebApp();
    if (!twa) {
      resolve(confirm(message));
      return;
    }
    twa.showConfirm(message, resolve);
  });
}

/**
 * Generate a mock user for development/testing outside Telegram.
 */
export function getMockUser() {
  const params = new URLSearchParams(window.location.search);
  const explicitName = params.get('player') ?? params.get('user');
  if (explicitName) {
    const cleanName = sanitizeWebUserName(explicitName) || 'Player';
    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
      hash = (hash * 31 + cleanName.charCodeAt(i)) >>> 0;
    }
    return {
      id: 100_000_000 + (hash % 800_000_000),
      first_name: cleanName,
      last_name: undefined,
      username: userNameFromDisplayName(cleanName),
      photo_url: undefined,
    };
  }

  const stored = readStorage(WEB_USER_STORAGE_KEY) ?? readStorage(LEGACY_WEB_USER_STORAGE_KEY);
  if (stored) {
    try {
      const user = JSON.parse(stored) as WebUserProfile;
      if (typeof user.id === 'number' && typeof user.first_name === 'string') {
        return saveWebUser(user);
      }
    } catch {
      removeStorage(WEB_USER_STORAGE_KEY);
      removeStorage(LEGACY_WEB_USER_STORAGE_KEY);
    }
  }

  const id = Math.floor(100_000_000 + Math.random() * 800_000_000);
  const user = {
    id,
    first_name: `Player${String(id).slice(-4)}`,
    last_name: undefined,
    username: `player_${String(id).slice(-6)}`,
    photo_url: undefined,
  };
  return saveWebUser(user);
}

export function saveWebUser(user: WebUserProfile): WebUserProfile {
  const firstName = sanitizeWebUserName(user.first_name) || `Player${String(user.id).slice(-4)}`;
  const saved = {
    id: user.id,
    first_name: firstName,
    last_name: undefined,
    username: userNameFromDisplayName(firstName),
    photo_url: user.photo_url,
  };
  const payload = JSON.stringify(saved);
  writeStorage(WEB_USER_STORAGE_KEY, payload);
  writeStorage(LEGACY_WEB_USER_STORAGE_KEY, payload);
  return saved;
}

export function sanitizeWebUserName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 32);
}

export function userNameFromDisplayName(name: string): string {
  const normalized = sanitizeWebUserName(name)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return normalized || 'player';
}

function readStorage(key: string): string | null {
  try {
    const localValue = window.localStorage.getItem(key);
    if (localValue) return localValue;
  } catch {
    // Ignore storage restrictions.
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage restrictions.
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage restrictions.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
}
