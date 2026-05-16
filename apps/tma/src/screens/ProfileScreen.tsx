import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { updatePlayerProfile } from '../services/gameService';
import { haptic, sanitizeWebUserName, saveWebUser } from '../services/telegram';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { CheckIcon } from '../components/icons/CheckIcon';
import { CrossIcon } from '../components/icons/CrossIcon';
import { ControllerIcon } from '../components/icons/ControllerIcon';
import { CoinsIcon } from '../components/icons/CoinsIcon';
import { FlameIcon } from '../components/icons/FlameIcon';
import { SwordsIcon } from '../components/icons/SwordsIcon';

export function ProfileScreen() {
  const { telegramUser, rating, stats, elmBalance, setScreen, setTelegramUser, transactions } = useGameStore();

  const displayName = telegramUser
    ? `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ''}`
    : 'Player';
  const isWebUser = telegramUser?.source === 'web';
  const [draftName, setDraftName] = useState(displayName);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const cleanDraftName = useMemo(() => sanitizeWebUserName(draftName), [draftName]);
  const canSaveWebName =
    isWebUser && cleanDraftName.length > 0 && cleanDraftName !== displayName && saveStatus !== 'saving';

  useEffect(() => {
    setDraftName(displayName);
    setSaveStatus('idle');
  }, [displayName]);

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
            {telegramUser?.username && (
              <div className="text-sm text-text-secondary">@{telegramUser.username}</div>
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
            <StarIcon size={16} className="text-gold" />
            <span className="font-black text-gold">{rating}</span>
            <span className="text-text-secondary text-sm">Rating</span>
          </div>
        </motion.div>

        {/* ELM Balance */}
        <motion.div
          className="glass-card p-4 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="text-xs text-text-secondary uppercase tracking-widest mb-2">ELM Balance</div>
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

        {/* Transaction History */}
        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase mb-3">
            Transaction History
          </div>
          {transactions.length === 0 ? (
            <div className="text-center py-6">
              <div className="flex justify-center mb-2">
                <ControllerIcon size={32} className="text-text-muted" />
              </div>
              <div className="text-sm text-text-muted">No transactions yet</div>
              <div className="text-xs text-text-muted mt-1">Play your first match!</div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {transactions.slice(0, 20).map((tx) => {
                const icon = tx.type === 'win' ? <CoinsIcon size={16} className="text-energy-high" /> :
                             tx.type === 'loss' ? <CoinsIcon size={16} className="text-energy-low" /> :
                             tx.type === 'stake' ? <CrossIcon size={16} className="text-text-secondary" /> :
                             tx.type === 'boost_burn' ? <FlameIcon size={16} className="text-energy-low" /> :
                             tx.type === 'boost_return' ? <CheckIcon size={16} className="text-energy-high" /> :
                             tx.type === 'rake' ? <CoinsIcon size={16} className="text-gold" /> :
                             <CoinsIcon size={16} className="text-text-muted" />;
                const color = tx.amount > 0 ? '#22c55e' : tx.amount < 0 ? '#ef4444' : '#8b949e';
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 px-3 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0">{icon}</span>
                      <span className="text-text-secondary text-xs truncate">{tx.description}</span>
                    </div>
                    <span className="font-bold text-xs ml-2 flex-shrink-0" style={{ color }}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount !== 0 ? tx.amount : '—'}
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
