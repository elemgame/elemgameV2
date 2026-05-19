import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { updatePlayerProfile } from '../services/gameService';
import { haptic, sanitizeWebUserName, saveWebUser } from '../services/telegram';
import { playerDisplayName, playerFullName } from '../services/playerProfile';
import { opponentWinRate } from '../services/opponentStats';
import { currencyForUser, formatCurrencyAmount, type EconomyCurrency } from '../services/economy';
import {
  requestWalletHistory,
  type WalletHistoryEntry,
  type WalletHistoryEntryKind,
  type WalletHistoryStatus,
} from '../services/payments';
import type { EconomyTransaction } from '../stores/gameStore';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { TrophyIcon } from '../components/icons/TrophyIcon';
import { TelegramStarsIcon } from '../components/icons/TelegramStarsIcon';
import { CheckIcon } from '../components/icons/CheckIcon';
import { CrossIcon } from '../components/icons/CrossIcon';
import { ControllerIcon } from '../components/icons/ControllerIcon';
import { CoinsIcon } from '../components/icons/CoinsIcon';
import { FlameIcon } from '../components/icons/FlameIcon';
import { SwordsIcon } from '../components/icons/SwordsIcon';

export function ProfileScreen() {
  const {
    telegramUser,
    rating,
    stats,
    opponentStats,
    elmBalance,
    setScreen,
    setTelegramUser,
    transactions,
    walletHistory,
    walletHistoryStatus,
    setWalletHistory,
  } = useGameStore();

  const displayName = playerDisplayName(telegramUser);
  const profileSubtitle = telegramUser?.source === 'telegram' && telegramUser.username
    ? playerFullName(telegramUser)
    : telegramUser?.username
      ? `@${telegramUser.username}`
      : '';
  const isWebUser = telegramUser?.source === 'web';
  const currency = currencyForUser(telegramUser);
  const [draftName, setDraftName] = useState(displayName);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const cleanDraftName = useMemo(() => sanitizeWebUserName(draftName), [draftName]);
  const canSaveWebName =
    isWebUser && cleanDraftName.length > 0 && cleanDraftName !== displayName && saveStatus !== 'saving';
  const historyItems = useMemo(
    () => buildHistoryItems(walletHistory, transactions),
    [walletHistory, transactions],
  );

  useEffect(() => {
    setDraftName(displayName);
    setSaveStatus('idle');
  }, [displayName]);

  useEffect(() => {
    if (telegramUser?.source !== 'telegram') {
      setWalletHistory([], null, 'idle');
      return;
    }

    const initData = telegramUser.initData ?? '';
    if (!initData) {
      setWalletHistory([], null, 'failed');
      return;
    }

    let cancelled = false;
    setWalletHistory([], null, 'loading');
    void requestWalletHistory({ initData }).then((history) => {
      if (cancelled) return;
      setWalletHistory(history.entries, history.summary, 'ready');
    }).catch(() => {
      if (cancelled) return;
      setWalletHistory([], null, 'failed');
    });

    return () => {
      cancelled = true;
    };
  }, [telegramUser?.id, telegramUser?.initData, telegramUser?.source, setWalletHistory]);

  const winRate =
    stats.wins + stats.losses > 0
      ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
      : 0;

  const totalGames = stats.wins + stats.losses;

  const handleSaveWebName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!telegramUser || !isWebUser || !cleanDraftName) return;

    setSaveStatus('saving');
    const savedUser = saveWebUser({
      id: telegramUser.id,
      first_name: cleanDraftName,
      photo_url: telegramUser.photo_url,
    });
    const nextUser = { ...savedUser, source: 'web' as const };
    setTelegramUser(nextUser);
    setDraftName(savedUser.first_name);

    try {
      await updatePlayerProfile(nextUser);
      haptic.success();
      setSaveStatus('saved');
    } catch {
      haptic.error();
      setSaveStatus('error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-game-bg">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            data-nav
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setScreen('home')}
          >
            <ArrowLeftIcon size={18} className="text-text-secondary" />
          </button>
          <h1 className="text-xl font-black text-text-primary">Profile</h1>
        </div>

        {/* Player card */}
        <motion.div
          className="glass-card p-5 flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black border-4 overflow-hidden"
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

          <div className="text-center">
            <div className="text-xl font-black text-text-primary">{displayName}</div>
            {profileSubtitle && (
              <div className="text-sm text-text-secondary">{profileSubtitle}</div>
            )}
          </div>

          {isWebUser && (
            <form className="w-full flex flex-col gap-2" onSubmit={handleSaveWebName}>
              <label className="text-[10px] text-text-secondary font-semibold uppercase tracking-widest">
                Web username
              </label>
              <div className="flex items-center gap-2">
                <input
                  data-nav
                  aria-label="Web username"
                  className="min-w-0 flex-1 rounded-xl border border-bg-border bg-bg-elevated px-3 py-2 text-sm font-bold text-text-primary outline-none focus:border-water"
                  value={draftName}
                  maxLength={32}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    if (saveStatus !== 'idle') setSaveStatus('idle');
                  }}
                />
                <motion.button
                  data-nav
                  type="submit"
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  style={{
                    background: canSaveWebName ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)',
                    border: canSaveWebName ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                  disabled={!canSaveWebName}
                  whileTap={canSaveWebName ? { scale: 0.95 } : {}}
                >
                  <CheckIcon size={18} className={canSaveWebName ? 'text-energy-high' : 'text-text-muted'} />
                </motion.button>
              </div>
              {saveStatus !== 'idle' && (
                <div
                  className={`text-xs ${
                    saveStatus === 'error'
                      ? 'text-energy-low'
                      : saveStatus === 'saved'
                        ? 'text-energy-high'
                        : 'text-text-secondary'
                  }`}
                >
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
                </div>
              )}
            </form>
          )}

          {/* Rating badge */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgba(255,215,0,0.15), rgba(255,140,0,0.1))',
              border: '1px solid rgba(255,215,0,0.3)',
            }}
          >
            <TrophyIcon size={16} className="text-gold" />
            <span className="font-black text-gold">{rating}</span>
            <span className="text-text-secondary text-sm">Rating</span>
          </div>
        </motion.div>

        {/* Balance */}
        <motion.div
          className="glass-card p-4 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="text-xs text-text-secondary uppercase tracking-widest mb-2">{currency} Balance</div>
          <div className="glow-text-gold text-4xl font-black">{elmBalance.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">tokens</div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Combat Stats
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Wins', value: stats.wins, color: '#22c55e', icon: <CheckIcon size={20} className="text-energy-high" /> },
              { label: 'Losses', value: stats.losses, color: '#ef4444', icon: <CrossIcon size={20} className="text-energy-low" /> },
              { label: 'Games', value: totalGames, color: '#3b82f6', icon: <ControllerIcon size={20} className="text-water-light" /> },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                {stat.icon}
                <span
                  className="text-2xl font-black tabular-nums"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </span>
                <span className="text-xs text-text-secondary">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Win rate bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-text-secondary">Win Rate</span>
              <span className="font-bold text-text-primary">{winRate}%</span>
            </div>
            <div
              className="h-2 rounded-full w-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: winRate >= 60
                    ? 'linear-gradient(90deg, #22c55e, #86efac)'
                    : winRate >= 40
                    ? 'linear-gradient(90deg, #eab308, #fde047)'
                    : 'linear-gradient(90deg, #ef4444, #fca5a5)',
                }}
                initial={{ width: 0 }}
                animate={{ width: `${winRate}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
        </motion.div>

        {/* Rival stats */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Rival Stats
          </div>
          {opponentStats.length === 0 ? (
            <div className="text-center py-5">
              <div className="flex justify-center mb-2">
                <SwordsIcon size={28} className="text-text-muted" />
              </div>
              <div className="text-sm text-text-muted">No rivals yet</div>
              <div className="text-xs text-text-muted mt-1">Finish a match to track head-to-head stats</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {opponentStats.slice(0, 8).map((rival) => (
                <div
                  key={rival.opponentName}
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-text-primary truncate">{rival.opponentName}</div>
                      <div className="text-[11px] text-text-secondary">
                        {rival.matches} games · {opponentWinRate(rival)}% win rate
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right flex-shrink-0">
                      <div>
                        <div className="text-lg font-black text-energy-high tabular-nums">{rival.wins}</div>
                        <div className="text-[10px] text-text-muted uppercase">beat</div>
                      </div>
                      <div>
                        <div className="text-lg font-black text-energy-low tabular-nums">{rival.losses}</div>
                        <div className="text-[10px] text-text-muted uppercase">lost</div>
                      </div>
                      <div>
                        <div className="text-lg font-black text-text-secondary tabular-nums">{rival.draws}</div>
                        <div className="text-[10px] text-text-muted uppercase">draw</div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="mt-2 h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <motion.div
                      className="h-full rounded-full bg-energy-high"
                      initial={{ width: 0 }}
                      animate={{ width: `${opponentWinRate(rival)}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Wallet History */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase">
              Wallet History
            </div>
            {walletHistoryStatus === 'loading' ? (
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Syncing</div>
            ) : walletHistoryStatus === 'failed' && telegramUser?.source === 'telegram' ? (
              <div className="text-[10px] font-bold uppercase tracking-widest text-energy-low">Offline</div>
            ) : null}
          </div>
          {historyItems.length === 0 ? (
            <div className="text-center py-6">
              <div className="flex justify-center mb-2">
                <ControllerIcon size={32} className="text-text-muted" />
              </div>
              <div className="text-sm text-text-muted">No wallet activity yet</div>
              <div className="text-xs text-text-muted mt-1">Play your first match!</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {historyItems.slice(0, 30).map((item) => {
                const color = item.elmAmount > 0 ? '#22c55e' : item.elmAmount < 0 ? '#ef4444' : '#8b949e';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0">{historyIcon(item)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-xs font-bold truncate">{item.title}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${historyStatusClass(item.status)}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="text-text-secondary text-[11px] truncate">{item.description}</div>
                        <div className="text-text-muted text-[10px]">{formatHistoryTime(item.occurredAt)}</div>
                      </div>
                    </div>
                    <span className="font-bold text-xs ml-2 flex-shrink-0" style={{ color }}>
                      {historyAmountLabel(item, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {totalGames === 0 && (
          <motion.div
            className="glass-card p-4 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex justify-center mb-2">
              <SwordsIcon size={24} className="text-text-muted" />
            </div>
            <div className="text-sm text-text-primary font-bold">Ready for battle?</div>
            <div className="text-xs text-text-muted mt-1">Play your first match to see stats here</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

interface HistoryDisplayItem {
  id: string;
  kind: WalletHistoryEntryKind | EconomyTransaction['type'];
  status: WalletHistoryStatus;
  title: string;
  description: string;
  occurredAt: string;
  elmAmount: number;
  starsAmount?: number;
  matchId?: string;
}

function buildHistoryItems(
  walletHistory: WalletHistoryEntry[],
  transactions: EconomyTransaction[],
): HistoryDisplayItem[] {
  const walletMatchIds = new Set(
    walletHistory
      .filter(entry => entry.matchId && isMatchWalletKind(entry.kind))
      .map(entry => entry.matchId),
  );
  const localItems = transactions
    .filter(tx => !walletMatchIds.has(tx.matchId))
    .map(transactionToHistoryItem);

  return [
    ...walletHistory.map(walletEntryToHistoryItem),
    ...localItems,
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function walletEntryToHistoryItem(entry: WalletHistoryEntry): HistoryDisplayItem {
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    title: entry.title,
    description: entry.description,
    occurredAt: entry.occurredAt,
    elmAmount: entry.elmAmount,
    starsAmount: entry.starsAmount,
    matchId: entry.matchId,
  };
}

function transactionToHistoryItem(tx: EconomyTransaction): HistoryDisplayItem {
  return {
    id: tx.id,
    kind: tx.type,
    status: 'settled',
    title: transactionTitle(tx.type),
    description: tx.description,
    occurredAt: new Date(tx.timestamp).toISOString(),
    elmAmount: tx.amount,
    matchId: tx.matchId,
  };
}

function transactionTitle(type: EconomyTransaction['type']): string {
  switch (type) {
    case 'entry_fee':
      return 'Match entry fee';
    case 'boost_cost':
      return 'Energy Boost cost';
    case 'stake':
      return 'Legacy match debit';
    case 'win':
      return 'PvP result';
    case 'loss':
      return 'PvP loss';
    case 'boost_burn':
      return 'Energy Boost spent';
    case 'boost_return':
      return 'Energy Boost returned';
    case 'rake':
      return 'Legacy match fee';
  }
}

function historyIcon(item: HistoryDisplayItem): React.ReactNode {
  if (item.kind === 'stars_purchase') return <TelegramStarsIcon size={16} className="text-gold" />;
  if (item.kind === 'stars_refund') return <TelegramStarsIcon size={16} className={item.status === 'pending' ? 'text-text-muted' : 'text-energy-high'} />;
  if (item.kind === 'elm_credit' || item.kind === 'pvp_win' || item.kind === 'pvp_draw_refund') {
    return <CoinsIcon size={16} className="text-energy-high" />;
  }
  if (item.kind === 'match_boost_cost' || item.kind === 'pvp_boost_stake' || item.kind === 'boost_cost' || item.kind === 'boost_burn') return <FlameIcon size={16} className="text-energy-low" />;
  if (item.kind === 'pvp_boost_return' || item.kind === 'boost_return') return <CheckIcon size={16} className="text-energy-high" />;
  if (item.elmAmount < 0) return <CrossIcon size={16} className="text-energy-low" />;
  return <CoinsIcon size={16} className="text-text-muted" />;
}

function isMatchWalletKind(kind: WalletHistoryEntryKind): boolean {
  return kind.startsWith('pvp_') || kind.startsWith('match_');
}

function historyStatusClass(status: WalletHistoryStatus): string {
  switch (status) {
    case 'settled':
      return 'text-energy-high';
    case 'pending':
      return 'text-gold';
    case 'failed':
      return 'text-energy-low';
  }
}

function historyAmountLabel(item: HistoryDisplayItem, currency: EconomyCurrency): string {
  if (item.kind === 'stars_purchase') return `${item.starsAmount ?? 0}★`;
  if (item.kind === 'stars_refund') return `+${item.starsAmount ?? 0}★`;
  if (item.elmAmount === 0) return '—';
  return formatCurrencyAmount(item.elmAmount, currency, { signed: true });
}

function formatHistoryTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';
  return time.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
