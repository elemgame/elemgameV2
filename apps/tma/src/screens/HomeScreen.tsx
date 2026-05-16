import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { GameMode } from '@elmental/shared';
import { haptic } from '../services/telegram';
import { startMatchmaking } from '../services/gameService';
import { playerDisplayName } from '../services/playerProfile';
import {
  ELM_STARS_PACKAGES,
  openTelegramStarsInvoice,
  requestStarsRefund,
  requestStarsRefundQuote,
  requestStarsInvoice,
  type ElmStarsPackageId,
  type StarsRefundQuote,
  type TelegramInvoiceStatus,
} from '../services/payments';
import { currencyForUser, formatCurrencyAmount } from '../services/economy';
import { SwordsIcon } from '../components/icons/SwordsIcon';
import { SkullIcon } from '../components/icons/SkullIcon';
import { VortexIcon } from '../components/icons/VortexIcon';
import { UserIcon } from '../components/icons/UserIcon';
import { GearIcon } from '../components/icons/GearIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { BoltIcon } from '../components/icons/BoltIcon';
import { EarthIcon } from '../components/icons/EarthIcon';
import { WaterIcon } from '../components/icons/WaterIcon';

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

type TopUpStatus = 'idle' | 'loading' | TelegramInvoiceStatus;

interface TopUpState {
  status: TopUpStatus;
  packageId?: ElmStarsPackageId;
  message?: string;
}

interface RefundState {
  status: 'idle' | 'loading' | 'ready' | 'refunded' | 'failed';
  quote?: StarsRefundQuote;
  message?: string;
}

export function HomeScreen() {
  const {
    telegramUser,
    elmBalance,
    rating,
    stats,
    gameMode,
    boostEnabled,
    setGameMode,
    setBoostEnabled,
    setScreen,
  } = useGameStore();
  const [topUpState, setTopUpState] = React.useState<TopUpState>({ status: 'idle' });
  const [refundState, setRefundState] = React.useState<RefundState>({ status: 'idle' });

  const displayName = playerDisplayName(telegramUser);

  const winRate =
    stats.wins + stats.losses > 0
      ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
      : 0;

  const stakeRequired = 100 + (boostEnabled ? 10 : 0);
  const canAffordMatch = elmBalance >= stakeRequired;
  const currency = currencyForUser(telegramUser);
  const showStarsTopUp = telegramUser?.source === 'telegram' && Boolean(telegramUser.initData);
  const pendingPackageId = topUpState.status === 'loading' ? topUpState.packageId : undefined;

  const handlePlay = () => {
    if (!canAffordMatch) {
      haptic.error();
      return;
    }
    haptic.medium();
    void startMatchmaking();
  };

  const handleTopUp = async (packageId: ElmStarsPackageId) => {
    const initData = telegramUser?.initData ?? '';
    if (!initData) {
      haptic.error();
      setTopUpState({ status: 'failed', message: 'Telegram session unavailable.' });
      return;
    }

    haptic.selection();
    setTopUpState({ status: 'loading', packageId, message: 'Opening invoice...' });

    try {
      const invoice = await requestStarsInvoice({ initData, packageId });
      const invoiceStatus = await openTelegramStarsInvoice(invoice.invoiceLink);
      setTopUpState(topUpStateForInvoiceStatus(invoiceStatus));
      notifyInvoiceStatus(invoiceStatus);
    } catch {
      haptic.error();
      setTopUpState({ status: 'failed', message: 'Payment failed.' });
    }
  };

  const handleRefundQuote = async () => {
    const initData = telegramUser?.initData ?? '';
    if (!initData) {
      haptic.error();
      setRefundState({ status: 'failed', message: 'Telegram session unavailable.' });
      return;
    }

    haptic.selection();
    setRefundState({ status: 'loading', message: 'Checking refundable lots...' });
    try {
      const quote = await requestStarsRefundQuote({ initData });
      setRefundState({
        status: 'ready',
        quote,
        message: refundQuoteMessage(quote),
      });
    } catch {
      haptic.error();
      setRefundState({ status: 'failed', message: 'Refund check failed.' });
    }
  };

  const handleRefundNextLot = async () => {
    const initData = telegramUser?.initData ?? '';
    const lot = refundState.quote?.nextLot;
    if (!initData || !lot) return;

    haptic.warning();
    setRefundState({ ...refundState, status: 'loading', message: 'Refunding Stars...' });
    try {
      const result = await requestStarsRefund({ initData, starsAmount: lot.starsAmount });
      haptic.success();
      setRefundState({
        status: 'refunded',
        message: `Refunded ${result.refundedStarsAmount} Stars. Balance updates from server.`,
      });
    } catch {
      haptic.error();
      setRefundState({ status: 'failed', message: 'Refund failed. Contact support if Stars were already refunded.' });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-game-bg">
      <div className="flex flex-col gap-4 p-4 pb-6">

        {/* Header bar */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-black overflow-hidden border-2"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                borderColor: 'rgba(255,255,255,0.2)',
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
              <div className="text-xs text-text-secondary flex items-center gap-0.5">
                <StarIcon size={12} className="text-gold" /> {rating} Rating
              </div>
            </div>
          </div>

          {/* Top right actions */}
          <div className="flex gap-2">
            <button
              data-nav
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => setScreen('profile')}
            >
              <UserIcon size={18} className="text-text-secondary" />
            </button>
            <button
              data-nav
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => setScreen('settings')}
            >
              <GearIcon size={18} className="text-text-secondary" />
            </button>
          </div>
        </motion.div>

        {/* Balance card */}
        <motion.div
          className="glass-card p-5 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-1">
            {currency} Balance
          </div>
          <motion.div
            className="glow-text-gold text-5xl font-black tabular-nums"
            animate={{ textShadow: ['0 0 10px rgba(255,215,0,0.4)', '0 0 20px rgba(255,215,0,0.7)', '0 0 10px rgba(255,215,0,0.4)'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            {elmBalance.toLocaleString()}
          </motion.div>
          <div className="text-xs text-text-secondary mt-1">tokens</div>

          {/* Win/Loss stats */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-bg-border">
            <div className="text-center">
              <div className="text-lg font-black text-energy-high">{stats.wins}</div>
              <div className="text-xs text-text-secondary">Wins</div>
            </div>
            <div
              className="w-px h-8"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
            <div className="text-center">
              <div className="text-lg font-black text-energy-low">{stats.losses}</div>
              <div className="text-xs text-text-secondary">Losses</div>
            </div>
            <div
              className="w-px h-8"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
            <div className="text-center">
              <div className="text-lg font-black text-water-light">{winRate}%</div>
              <div className="text-xs text-text-secondary">Win Rate</div>
            </div>
          </div>

          {showStarsTopUp ? (
            <div className="mt-4 pt-4 border-t border-bg-border text-left">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase">
                  Top up
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-gold">
                  <StarIcon size={12} />
                  Stars
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ELM_STARS_PACKAGES.map((pkg) => {
                  const isPending = pendingPackageId === pkg.id;
                  const disabled = topUpState.status === 'loading';
                  return (
                    <motion.button
                      key={pkg.id}
                      data-nav
                      className="min-h-[58px] rounded-xl border px-2 py-2 flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-60 disabled:cursor-wait"
                      style={{
                        borderColor: isPending ? '#ffd700' : 'rgba(255,255,255,0.1)',
                        background: isPending ? 'rgba(255, 215, 0, 0.12)' : 'rgba(255,255,255,0.04)',
                      }}
                      disabled={disabled}
                      whileTap={!disabled ? { scale: 0.96 } : undefined}
                      onClick={() => void handleTopUp(pkg.id)}
                    >
                      <span className="flex items-center justify-center gap-1 text-sm font-black text-gold leading-none">
                        <StarIcon size={13} />
                        {pkg.starsAmount}
                      </span>
                      <span className="text-[11px] font-bold text-text-primary leading-tight">
                        {pkg.elmAmount.toLocaleString()} ELM
                      </span>
                    </motion.button>
                  );
                })}
              </div>
              {topUpState.message ? (
                <div
                  role="status"
                  className={`mt-3 text-xs font-semibold leading-tight ${topUpStatusClass(topUpState.status)}`}
                >
                  {topUpState.message}
                </div>
              ) : null}

              <div className="mt-4 pt-4 border-t border-bg-border">
                <div className="flex items-center justify-between gap-2">
                  <button
                    data-nav
                    className="min-h-[38px] rounded-xl border px-3 py-2 text-xs font-bold text-text-primary disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
                    disabled={refundState.status === 'loading'}
                    onClick={() => void handleRefundQuote()}
                  >
                    Refund eligible ELM
                  </button>
                  {refundState.quote?.nextLot ? (
                    <button
                      data-nav
                      className="min-h-[38px] rounded-xl border px-3 py-2 text-xs font-black text-gold disabled:opacity-60"
                      style={{ background: 'rgba(255, 215, 0, 0.1)', borderColor: 'rgba(255,215,0,0.25)' }}
                      disabled={refundState.status === 'loading'}
                      onClick={() => void handleRefundNextLot()}
                    >
                      {refundState.quote.nextLot.starsAmount}★ / {refundState.quote.nextLot.elmAmount} ELM
                    </button>
                  ) : null}
                </div>
                {refundState.message ? (
                  <div
                    role="status"
                    className={`mt-3 text-xs font-semibold leading-tight ${refundStatusClass(refundState.status)}`}
                  >
                    {refundState.message}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </motion.div>

        {/* Game Mode selector */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Game Mode
          </div>
          <div className="grid grid-cols-3 gap-2">
            {GAME_MODES.map((mode) => {
              const isSelected = gameMode === mode.id;
              return (
                <motion.button
                  key={mode.id}
                  data-nav
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-colors"
                  style={{
                    borderColor: isSelected ? mode.color : 'rgba(255,255,255,0.08)',
                    background: isSelected
                      ? `${mode.color}18`
                      : 'rgba(255,255,255,0.03)',
                    boxShadow: isSelected ? `0 0 10px ${mode.color}40` : 'none',
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
          className="glass-card p-4 flex items-center justify-between"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <BoltIcon size={24} className="text-gold" />
            <div>
              <div className="font-bold text-sm text-text-primary">Energy Boost</div>
              <div className="text-xs text-text-secondary">
                Start with +20 energy (+10% stake)
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
                ? 'linear-gradient(90deg, #eab308, #ffd700)'
                : 'rgba(255,255,255,0.1)',
              border: boostEnabled ? '1px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
              boxShadow: boostEnabled ? '0 0 10px rgba(255,215,0,0.4)' : 'none',
            }}
            onClick={() => {
              haptic.selection();
              setBoostEnabled(!boostEnabled);
            }}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full"
              style={{
                background: boostEnabled ? '#000' : 'rgba(255,255,255,0.6)',
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
          <div className="text-xs text-text-muted">
            {canAffordMatch
              ? `Stake: ${formatCurrencyAmount(stakeRequired, currency)} • ${gameMode} mode`
              : `Need ${formatCurrencyAmount(stakeRequired, currency)} (have ${formatCurrencyAmount(elmBalance, currency)})`}
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
    </div>
  );
}

function topUpStateForInvoiceStatus(status: TelegramInvoiceStatus): TopUpState {
  switch (status) {
    case 'paid':
      return { status, message: 'Paid. Waiting for server balance.' };
    case 'cancelled':
      return { status, message: 'Payment canceled.' };
    case 'pending':
      return { status, message: 'Payment pending.' };
    case 'failed':
      return { status, message: 'Payment failed.' };
    case 'unknown':
      return { status, message: 'Payment status unknown.' };
  }
}

function notifyInvoiceStatus(status: TelegramInvoiceStatus): void {
  if (status === 'paid') {
    haptic.success();
  } else if (status === 'failed' || status === 'unknown') {
    haptic.error();
  } else {
    haptic.selection();
  }
}

function topUpStatusClass(status: TopUpStatus): string {
  switch (status) {
    case 'paid':
      return 'text-energy-high';
    case 'failed':
    case 'unknown':
      return 'text-energy-low';
    case 'pending':
      return 'text-water-light';
    case 'cancelled':
      return 'text-text-muted';
    case 'loading':
    case 'idle':
      return 'text-text-secondary';
  }
}

function refundQuoteMessage(quote: StarsRefundQuote): string {
  if (quote.nextLot) {
    return `Next refundable lot: ${quote.nextLot.starsAmount} Stars for ${quote.nextLot.elmAmount} unused ELM.`;
  }
  return quote.note ?? 'No refundable unused purchase lots.';
}

function refundStatusClass(status: RefundState['status']): string {
  switch (status) {
    case 'ready':
    case 'refunded':
      return 'text-energy-high';
    case 'failed':
      return 'text-energy-low';
    case 'loading':
    case 'idle':
      return 'text-text-secondary';
  }
}
