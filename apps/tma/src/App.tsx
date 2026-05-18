import React, { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import {
  initTelegram,
  installTelegramViewportSync,
  getTelegramInitData,
  getTelegramUser,
  getMockUser,
} from './services/telegram';
import { initializeGameSession, updatePlayerProfile } from './services/gameService';
import { installBugReportCapture } from './services/bugReport';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';
import { ReportBugButton } from './components/ReportBugButton';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { MatchmakingScreen } from './screens/MatchmakingScreen';
import { MatchScreen } from './screens/MatchScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AdminScreen } from './screens/AdminScreen';

export default function App() {
  const { currentScreen, setTelegramUser } = useGameStore();
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  // Enable spatial keyboard navigation (Tab + Arrow keys)
  useSpatialNavigation();

  // Initialize Telegram SDK and load user
  useEffect(() => {
    installBugReportCapture();
    initTelegram();
    const uninstallViewportSync = installTelegramViewportSync();
    const retryTimers: number[] = [];

    if (isAdminRoute) {
      return uninstallViewportSync;
    }

    let disposed = false;
    let initialized = false;
    let appliedProfileKey = '';
    const fallbackWebUser = getMockUser();

    const readProfile = () => {
      const tgUser = getTelegramUser();
      const user = tgUser ?? fallbackWebUser;
      const source: 'telegram' | 'web' = tgUser ? 'telegram' : 'web';
      return {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        photo_url: user.photo_url,
        source,
        initData: tgUser ? getTelegramInitData() : undefined,
      };
    };

    const applyProfile = (profileUser: ReturnType<typeof readProfile>) => {
      const profileKey = `${profileUser.source}:${profileUser.id}:${profileUser.initData ? 'signed' : 'unsigned'}`;
      if (profileKey === appliedProfileKey || disposed) return;

      appliedProfileKey = profileKey;
      setTelegramUser(profileUser);

      if (!initialized) {
        initialized = true;
        void initializeGameSession(profileUser);
        return;
      }

      void updatePlayerProfile(profileUser);
    };

    const initialProfile = readProfile();
    applyProfile(initialProfile);

    if (initialProfile.source !== 'telegram' || !initialProfile.initData) {
      for (const delayMs of [100, 300, 700, 1_500, 3_000, 6_000]) {
        retryTimers.push(window.setTimeout(() => {
          const profileUser = readProfile();
          if (profileUser.source !== 'telegram' || !profileUser.initData) return;
          applyProfile(profileUser);
        }, delayMs));
      }
    }

    return () => {
      disposed = true;
      for (const timer of retryTimers) window.clearTimeout(timer);
      uninstallViewportSync();
    };
  }, [isAdminRoute, setTelegramUser]);

  if (isAdminRoute) {
    return <AdminScreen />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'matchmaking':
        return <MatchmakingScreen />;
      case 'match':
        return <MatchScreen />;
      case 'result':
        return <ResultScreen />;
      case 'profile':
        return <ProfileScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 'var(--elmental-app-height)',
        background: '#0a0a1a',
        maxWidth: '430px',
        margin: '0 auto',
      }}
    >
      <div className="app-safe-shell absolute inset-0 overflow-hidden">
        <div key={currentScreen} className="relative h-full w-full">
          {renderScreen()}
        </div>
      </div>
      <ReportBugButton />
    </div>
  );
}
