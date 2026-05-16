/**
 * Telegram Mini App SDK helpers.
 * Provides safe access to the TWA SDK (works in both browser and Telegram).
 */

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
  onEvent(eventType: string, cb: () => void): void;
  offEvent(eventType: string, cb: () => void): void;
  sendData(data: string): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showPopup(params: unknown, cb?: (button_id: string) => void): void;
  showAlert(message: string, cb?: () => void): void;
  showConfirm(message: string, cb?: (confirmed: boolean) => void): void;
}

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
  return window.Telegram?.WebApp ?? null;
}

/**
 * Initialize the TWA: call ready() and expand().
 */
export function initTelegram(): void {
  const twa = getTelegramWebApp();
  if (!twa) return;
  try {
    twa.ready();
    twa.expand();
  } catch {
    // swallow — not critical
  }
}

/**
 * Get the Telegram user from initDataUnsafe.
 * Returns null when running outside Telegram.
 */
export function getTelegramUser() {
  const twa = getTelegramWebApp();
  if (!twa) return null;
  return twa.initDataUnsafe?.user ?? null;
}

/**
 * Raw signed Telegram initData used by the backend auth endpoint.
 */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
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
    let hash = 0;
    for (let i = 0; i < explicitName.length; i++) {
      hash = (hash * 31 + explicitName.charCodeAt(i)) >>> 0;
    }
    return {
      id: 100_000_000 + (hash % 800_000_000),
      first_name: explicitName,
      last_name: undefined,
      username: explicitName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      photo_url: undefined,
    };
  }

  const storageKey = 'elmental.devUser';
  const stored = sessionStorage.getItem(storageKey);
  if (stored) {
    try {
      return JSON.parse(stored) as {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
      };
    } catch {
      sessionStorage.removeItem(storageKey);
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
  sessionStorage.setItem(storageKey, JSON.stringify(user));
  return {
    ...user,
  };
}
