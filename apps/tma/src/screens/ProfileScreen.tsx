import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';

export function ProfileScreen() {
  const { telegramUser, rating, stats, elmBalance, setScreen, transactions } = useGameStore();

  const displayName = telegramUser
    ? `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ''}`
    : 'Player';

  const winRate =
    stats.wins + stats.losses > 0
      ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
      : 0;

  const totalGames = stats.wins + stats.losses;

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-game-bg">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            data-nav
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setScreen('home')}
          >
            ←
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

          {/* Rating badge */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgba(255,215,0,0.15), rgba(255,140,0,0.1))',
              border: '1px solid rgba(255,215,0,0.3)',
            }}
          >
            <span>⭐</span>
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
              { label: 'Wins', value: stats.wins, color: '#22c55e', icon: '✅' },
              { label: 'Losses', value: stats.losses, color: '#ef4444', icon: '❌' },
              { label: 'Games', value: totalGames, color: '#3b82f6', icon: '🎮' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <span className="text-xl">{stat.icon}</span>
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
              <div className="text-3xl mb-2">🎮</div>
              <div className="text-sm text-text-muted">No transactions yet</div>
              <div className="text-xs text-text-muted mt-1">Play your first match!</div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {transactions.slice(0, 20).map((tx) => {
                const icon = tx.type === 'win' ? '💰' : tx.type === 'loss' ? '💸' :
                             tx.type === 'stake' ? '🎯' : tx.type === 'boost_burn' ? '🔥' :
                             tx.type === 'boost_return' ? '✅' : tx.type === 'rake' ? '🏦' : '📋';
                const color = tx.amount > 0 ? '#22c55e' : tx.amount < 0 ? '#ef4444' : '#8b949e';
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 px-3 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span>{icon}</span>
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
            <div className="text-2xl mb-2">⚔️</div>
            <div className="text-sm text-text-primary font-bold">Ready for battle?</div>
            <div className="text-xs text-text-muted mt-1">Play your first match to see stats here</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
