import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import {
  BOOST_PERCENT,
  GameMode,
  MATCH_ENTRY_FEE,
  SEASON_POINTS_CLEAN_WIN,
  SEASON_POINTS_DRAW,
  SEASON_POINTS_LOSS,
  SEASON_POINTS_WIN,
} from '@elmental/shared';
import { haptic } from '../services/telegram';
import { startMatchmaking } from '../services/gameService';
import { playerDisplayName } from '../services/playerProfile';
import { currencyForUser, formatCurrencyAmount } from '../services/economy';
import { SwordsIcon } from '../components/icons/SwordsIcon';
import { SkullIcon } from '../components/icons/SkullIcon';
import { TrophyIcon } from '../components/icons/TrophyIcon';
import { VortexIcon } from '../components/icons/VortexIcon';
import { InfoIcon } from '../components/icons/InfoIcon';
import { GearIcon } from '../components/icons/GearIcon';
import { BoltIcon } from '../components/icons/BoltIcon';
import { EarthIcon } from '../components/icons/EarthIcon';
import { WaterIcon } from '../components/icons/WaterIcon';
import { CrossIcon } from '../components/icons/CrossIcon';
import { TopUpOverlay } from '../components/topUp/TopUpOverlay';

const GAME_MODES = [
  {
    id: GameMode.Classic,
    label: 'Classic',
    renderIcon: (size: number) => <SwordsIcon size={size} className="text-water-light" />,
    desc: 'Energy regen on result',
    color: '#3b82f6',
  },
  {
    id: GameMode.Hardcore,
    label: 'Hardcore',
    renderIcon: (size: number) => <SkullIcon size={size} className="text-fire" />,
    desc: 'No energy regen',
    color: '#ef4444',
  },
  {
    id: GameMode.Chaos,
    label: 'Chaos',
    renderIcon: (size: number) => <VortexIcon size={size} className="text-purple-400" />,
    desc: 'Random regen',
    color: '#a855f7',
  },
] as const;

export function HomeScreen() {
  const {
    telegramUser,
    elmBalance,
    seasonPoints,
    rating,
    stats,
    gameMode,
    boostEnabled,
    setGameMode,
    setBoostEnabled,
    setScreen,
  } = useGameStore();
  const [isSeasonInfoOpen, setIsSeasonInfoOpen] = useState(false);
  const displayName = playerDisplayName(telegramUser);

  const winRate =
    stats.wins + stats.losses > 0
      ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
      : 0;

  const boostStake = boostEnabled ? Math.ceil((MATCH_ENTRY_FEE * BOOST_PERCENT) / 100) : 0;
  const matchCost = MATCH_ENTRY_FEE + boostStake;
  const canAffordMatch = elmBalance >= matchCost;
  const currency = currencyForUser(telegramUser);
  const isTelegramBalance = telegramUser?.source === 'telegram';
  const rewardPreview = [
    { label: 'Clean Win', value: SEASON_POINTS_CLEAN_WIN },
    { label: 'Win', value: SEASON_POINTS_WIN },
    { label: 'Draw', value: SEASON_POINTS_DRAW },
    { label: 'Play', value: SEASON_POINTS_LOSS },
  ];

  const handlePlay = () => {
    if (!canAffordMatch) {
      haptic.error();
      return;
    }
    haptic.medium();
    void startMatchmaking();
  };

  const openSeasonInfo = () => {
    haptic.light();
    setIsSeasonInfoOpen(true);
  };

  const closeSeasonInfo = () => {
    setIsSeasonInfoOpen(false);
  };

  return (
    <div className="game-home-stage flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="flex flex-col gap-4 p-4 pb-7">

        {/* Header bar */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            type="button"
            data-nav
            className="arena-player-chip flex items-center gap-2"
            aria-label="Open profile"
            onClick={() => setScreen('profile')}
          >
            {/* Avatar */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-black overflow-hidden border-2"
              style={{
                background: 'linear-gradient(135deg, oklch(88% 0.12 87), oklch(68% 0.135 238))',
                borderColor: 'oklch(100% 0 0 / 0.2)',
                boxShadow: '0 10px 22px oklch(3% 0.02 252 / 0.42)',
              }}
            >
              {telegramUser?.photo_url ? (
                <img
                  src={telegramUser.photo_url}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="font-bold text-sm text-text-primary leading-tight">
                {displayName}
              </div>
              <div className="text-[14px] text-text-secondary flex items-center gap-1">
                <TrophyIcon size={14} className="text-gold" /> {rating} Rating
              </div>
            </div>
          </button>

          {/* Top right actions */}
          <div className="flex gap-2">
            <button
              data-nav
              className="hud-icon-button flex items-center justify-center"
              aria-label="Open season info"
              onClick={openSeasonInfo}
            >
              <InfoIcon size={18} className="text-text-secondary" />
            </button>
            <button
              data-nav
              className="hud-icon-button flex items-center justify-center"
              aria-label="Open settings"
              onClick={() => setScreen('settings')}
            >
              <GearIcon size={18} className="text-text-secondary" />
            </button>
          </div>
        </motion.div>

        {/* Arena HUD */}
        <motion.div
          className="arena-balance-hud"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-1">
            {isTelegramBalance ? 'ELM Match Credits' : 'Demo tELM Credits'}
          </div>
          <div className="flex items-center justify-center gap-2">
            <motion.div
              className="balance-number-inline glow-text-gold text-5xl font-black tabular-nums"
              animate={{ textShadow: ['0 0 18px oklch(78% 0.15 83 / 0.3)', '0 0 28px oklch(78% 0.15 83 / 0.46)', '0 0 18px oklch(78% 0.15 83 / 0.3)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              {elmBalance.toLocaleString()}
            </motion.div>
            <TopUpOverlay />
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">match credits</div>

          {/* Win/Loss stats */}
          <div className="flex items-center justify-center gap-2 mt-5">
            <div className="arena-stat-chip text-center">
              <div className="text-lg font-black text-energy-high">{stats.wins}</div>
              <div className="text-xs text-text-secondary">Wins</div>
            </div>
            <div className="arena-stat-chip text-center">
              <div className="text-lg font-black text-energy-low">{stats.losses}</div>
              <div className="text-xs text-text-secondary">Losses</div>
            </div>
            <div className="arena-stat-chip text-center">
              <div className="text-lg font-black text-water-light">{winRate}%</div>
              <div className="text-xs text-text-secondary">Win Rate</div>
            </div>
            <div className="arena-stat-chip text-center">
              <div className="text-lg font-black text-gold">{seasonPoints.toLocaleString()}</div>
              <div className="text-xs text-text-secondary">SP Earned</div>
            </div>
          </div>

        </motion.div>

        {/* Game Mode selector */}
        <motion.div
          className="arena-mode-dock"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3 px-1">
            Game Mode
          </div>
          <div className="grid grid-cols-3 gap-2">
            {GAME_MODES.map((mode) => {
              const isSelected = gameMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  data-nav
                  className="arena-mode-option flex flex-col items-center justify-center gap-1.5 py-3 px-2 border transition-colors"
                  style={{
                    borderColor: isSelected ? 'oklch(78% 0.15 83 / 0.62)' : 'oklch(78% 0.15 83 / 0.18)',
                    background: isSelected ? 'oklch(24% 0.052 74 / 0.5)' : undefined,
                    boxShadow: isSelected
                      ? '0 0 22px oklch(78% 0.15 83 / 0.2), inset 0 0 16px oklch(78% 0.15 83 / 0.08)'
                      : undefined,
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptic.light();
                    setGameMode(mode.id);
                  }}
                >
                  <span className="flex items-center justify-center" style={{ width: 20, height: 20 }}>
                    {mode.renderIcon(20)}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: isSelected ? mode.color : '#8b949e' }}
                  >
                    {mode.label}
                  </span>
                  <span className="text-[10px] text-text-muted text-center leading-tight">
                    {mode.desc}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Energy Boost toggle */}
        <motion.div
          className="arena-toggle-strip flex items-center justify-between"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <BoltIcon size={24} className="text-gold" />
            <div>
              <div className="font-bold text-sm text-text-primary">Energy Boost</div>
              <div className="text-xs text-text-secondary">
                Start with +20 energy (+10% match cost)
              </div>
            </div>
          </div>
          <motion.button
            data-nav
            className="relative w-13 h-7 rounded-full transition-colors"
            style={{
              width: '52px',
              height: '28px',
              background: boostEnabled
                ? 'linear-gradient(90deg, oklch(72% 0.15 82), oklch(88% 0.12 87))'
                : 'oklch(10% 0.035 252 / 0.7)',
              border: boostEnabled ? '1px solid oklch(78% 0.15 83)' : '1px solid oklch(76% 0.026 86 / 0.26)',
              boxShadow: boostEnabled ? '0 10px 18px oklch(78% 0.15 83 / 0.28)' : '0 4px 10px oklch(3% 0.02 252 / 0.36) inset',
            }}
            onClick={() => {
              haptic.selection();
              setBoostEnabled(!boostEnabled);
            }}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full"
              style={{
                background: boostEnabled ? 'oklch(14% 0.045 252)' : 'oklch(59% 0.035 86)',
                bottom: '2px',
              }}
              animate={{ x: boostEnabled ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          </motion.button>
        </motion.div>

        {/* PLAY button */}
        <motion.div
          className="flex flex-col items-center gap-2 pt-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <motion.button
            data-nav
            className={`btn-play w-full text-center ${!canAffordMatch ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={!canAffordMatch ? { animation: 'none', filter: 'grayscale(0.5)' } : {}}
            whileTap={canAffordMatch ? { scale: 0.96 } : {}}
            onClick={handlePlay}
          >
            {canAffordMatch ? (
              <span className="flex items-center gap-2 justify-center">
                <SwordsIcon size={22} />
                PLAY NOW
              </span>
            ) : (
              `NOT ENOUGH ${currency}`
            )}
          </motion.button>
          <div className="arena-footnote-pill text-xs font-semibold text-text-secondary text-center">
            {canAffordMatch
              ? `Entry fee: ${formatCurrencyAmount(matchCost, currency)} | ${gameMode} mode`
              : `Need ${formatCurrencyAmount(matchCost, currency)} (have ${formatCurrencyAmount(elmBalance, currency)})`}
          </div>
        </motion.div>

        {/* Floating element decorations as CSS particles */}
        <div className="absolute top-20 right-4 opacity-5 pointer-events-none">
          <EarthIcon size={32} className="text-earth-light" />
        </div>
        <div className="absolute top-40 left-2 opacity-5 pointer-events-none">
          <WaterIcon size={28} className="text-water-light" />
        </div>
      </div>

      <AnimatePresence>
        {isSeasonInfoOpen ? (
          <motion.div
            className="top-up-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeSeasonInfo}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="season-info-title"
              className="top-up-sheet season-info-sheet"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="top-up-sheet-grip" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-black tracking-widest uppercase text-gold">
                    <TrophyIcon size={14} />
                    Match rewards
                  </div>
                  <h2 id="season-info-title" className="mt-1 text-2xl font-black leading-none text-text-primary">
                    Season Points
                  </h2>
                </div>
                <button
                  data-nav
                  type="button"
                  className="hud-icon-button flex shrink-0 items-center justify-center"
                  aria-label="Close season info"
                  onClick={closeSeasonInfo}
                >
                  <CrossIcon size={16} className="text-text-secondary" />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-3"
                style={{ borderColor: 'oklch(78% 0.15 83 / 0.2)', background: 'oklch(8% 0.03 252 / 0.58)' }}
              >
                <div className="text-xs font-semibold tracking-widest uppercase text-text-secondary">
                  Match entry
                </div>
                <div className="text-sm font-black text-gold">
                  {formatCurrencyAmount(MATCH_ENTRY_FEE, currency)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {rewardPreview.map((reward) => (
                  <div
                    key={reward.label}
                    className="arena-reward-chip px-3 py-2"
                  >
                    <div className="text-base font-black text-energy-high">+{reward.value}</div>
                    <div className="text-[11px] font-semibold text-text-secondary">{reward.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border px-3 py-3 text-xs font-semibold leading-snug text-text-secondary"
                style={{ borderColor: 'oklch(78% 0.15 83 / 0.18)', background: 'oklch(18% 0.044 72 / 0.42)' }}
              >
                {currency} opens matches. Season Points are earned from play and do not come from the opponent balance.
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
