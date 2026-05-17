import React, { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import {
  initTelegram,
  installTelegramViewportSync,
  getTelegramInitData,
  getTelegramUser,
  getMockUser,
} from './services/telegram';
import { initializeGameSession } from './services/gameService';
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

    if (isAdminRoute) {
      return uninstallViewportSync;
    }

    const tgUser = getTelegramUser();
    const user = tgUser ?? getMockUser();
    const source: 'telegram' | 'web' = tgUser ? 'telegram' : 'web';
    const profileUser = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
      source,
      initData: tgUser ? getTelegramInitData() : undefined,
    };

    setTelegramUser(profileUser);

    void initializeGameSession(profileUser);
    return uninstallViewportSync;
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
