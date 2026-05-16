import React, { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import { initTelegram, getTelegramUser, getMockUser } from './services/telegram';
import { initializeGameSession } from './services/gameService';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { MatchmakingScreen } from './screens/MatchmakingScreen';
import { MatchScreen } from './screens/MatchScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  const { currentScreen, setTelegramUser, setPlayerStats } = useGameStore();

  // Enable spatial keyboard navigation (Tab + Arrow keys)
  useSpatialNavigation();

  // Initialize Telegram SDK and load user
  useEffect(() => {
    initTelegram();

    const tgUser = getTelegramUser();
    const user = tgUser ?? getMockUser();

    setTelegramUser({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
    });

    setPlayerStats({
      elmBalance: 1000,
      rating: 1200,
      wins: 0,
      losses: 0,
    });

    void initializeGameSession(user);
  }, [setTelegramUser, setPlayerStats]);

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
        height: '100dvh',
        background: '#0a0a1a',
        maxWidth: '430px',
        margin: '0 auto',
      }}
    >
      <div key={currentScreen} className="absolute inset-0">
        {renderScreen()}
      </div>
    </div>
  );
}
