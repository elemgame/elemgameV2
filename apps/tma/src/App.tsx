import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from './stores/gameStore';
import { initTelegram, getTelegramUser, getMockUser } from './services/telegram';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { MatchmakingScreen } from './screens/MatchmakingScreen';
import { MatchScreen } from './screens/MatchScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Screen transition variants
const SCREEN_VARIANTS = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};

const TRANSITION = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

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

    // Load mock player stats (would come from server in production)
    setPlayerStats({
      elmBalance: 1000,
      rating: 1200,
      wins: 12,
      losses: 8,
    });
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
      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          className="absolute inset-0"
          variants={SCREEN_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={TRANSITION}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
