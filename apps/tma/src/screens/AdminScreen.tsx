import React, { useEffect, useMemo, useState } from 'react';
import {
  adjustAdminBalance,
  requestAdminAudit,
  requestAdminSession,
  requestAdminStats,
  requestAdminUser,
  searchAdminUsers,
  type AdminAuditEvent,
  type AdminBalanceKind,
  type AdminBalanceOperation,
  type AdminSession,
  type AdminStats,
  type AdminTimeWindow,
  type AdminUserDetail,
  type AdminUserSummary,
} from '../services/admin';
import { getTelegramInitData, initTelegram } from '../services/telegram';

type AdminTab = 'overview' | 'users' | 'balance' | 'audit';

export function AdminScreen() {
  const [initData, setInitData] = useState('');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [timeWindow, setTimeWindow] = useState<AdminTimeWindow>('24h');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [operation, setOperation] = useState<AdminBalanceOperation>('credit');
  const [balanceKind, setBalanceKind] = useState<AdminBalanceKind>('paid_elm');
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState('Booting admin session');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    initTelegram();
    const signedInitData = getTelegramInitData();
    setInitData(signedInitData);
    if (!signedInitData) {
      setLoading('');
      setError('Open this page from Telegram as a configured admin.');
      return;
    }

    setLoading('Checking admin access');
    requestAdminSession(signedInitData)
      .then(adminSession => {
        setSession(adminSession);
        setError('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Admin access failed'))
      .finally(() => setLoading(''));
  }, []);

  useEffect(() => {
    if (!session || !initData) return;
    setLoading('Loading dashboard');
    Promise.all([
      requestAdminStats(initData, timeWindow),
      requestAdminAudit(initData, timeWindow),
    ])
      .then(([nextStats, nextAudit]) => {
        setStats(nextStats);
        setAudit(nextAudit);
        setError('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Dashboard load failed'))
      .finally(() => setLoading(''));
  }, [initData, session, timeWindow]);

  const parsedAmount = Number(amount);
  const balancePreview = useMemo(() => {
    if (!selectedUser || !Number.isInteger(parsedAmount) || parsedAmount < 0) return null;
    if (operation === 'credit') return selectedUser.balance + parsedAmount;
    if (operation === 'debit') return selectedUser.balance - parsedAmount;
    return parsedAmount;
  }, [operation, parsedAmount, selectedUser]);

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setLoading('Searching users');
    setNotice('');
    try {
      const found = await searchAdminUsers(initData, query);
      setUsers(found);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User search failed');
    } finally {
      setLoading('');
    }
  }

  async function selectUser(accountId: string) {
    setLoading('Loading user');
    setNotice('');
    try {
      const user = await requestAdminUser(initData, accountId);
      setSelectedUser(user);
      setBalanceKind(user.balanceKind === 'demo_teml' ? 'demo_teml' : 'paid_elm');
      setTab('balance');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User load failed');
    } finally {
      setLoading('');
    }
  }

  async function submitBalanceOperation(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUser || balancePreview === null || !Number.isInteger(parsedAmount)) return;
    if (balancePreview < 0) {
      setError('Resulting balance cannot be negative.');
      return;
    }
    const ok = windowConfirm(
      `${operation.toUpperCase()} ${selectedUser.accountId}\n${selectedUser.balance} -> ${balancePreview} ${currencyLabel(balanceKind)}`,
    );
    if (!ok) return;

    setLoading('Applying balance operation');
    setNotice('');
    try {
      const result = await adjustAdminBalance({
        initData,
        accountId: selectedUser.accountId,
        balanceKind,
        operation,
        amount: parsedAmount,
        reason,
      });
      setSelectedUser(result.user);
      setNotice(`Balance updated. Audit ${result.audit.requestId}`);
      setAudit(await requestAdminAudit(initData, timeWindow));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Balance operation failed');
    } finally {
      setLoading('');
    }
  }

  if (!session) {
    return (
      <AdminFrame>
        <div className="admin-state">
          <div className="admin-kicker">Elmental Admin</div>
          <h1>Operator Access</h1>
          {loading && <p>{loading}</p>}
          {error && <p className="admin-error-text">{error}</p>}
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame>
      <header className="admin-header">
        <div>
          <div className="admin-kicker">Elmental Admin</div>
          <h1>Operations</h1>
        </div>
        <div className="admin-identity">
          <span>{session.admin.firstName}</span>
          <strong>{session.admin.telegramId}</strong>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        {(['overview', 'users', 'balance', 'audit'] as const).map(item => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {tabLabel(item)}
          </button>
        ))}
      </nav>

      <div className="admin-toolbar">
        <label>
          Window
          <select value={timeWindow} onChange={event => setTimeWindow(event.target.value as AdminTimeWindow)}>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </label>
        {loading && <span className="admin-muted">{loading}</span>}
        {notice && <span className="admin-ok-text">{notice}</span>}
        {error && <span className="admin-error-text">{error}</span>}
      </div>

      {tab === 'overview' && <Overview stats={stats} />}

      {tab === 'users' && (
        <section className="admin-section">
          <form className="admin-search" onSubmit={runSearch}>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Telegram ID, account ID, name, identity"
            />
            <button type="submit">Search</button>
          </form>
          <UserTable users={users} onSelect={selectUser} />
        </section>
      )}

      {tab === 'balance' && (
        <section className="admin-section admin-balance-grid">
          <UserDetail user={selectedUser} />
          <form className="admin-balance-form" onSubmit={submitBalanceOperation}>
            <label>
              Operation
              <select value={operation} onChange={event => setOperation(event.target.value as AdminBalanceOperation)}>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
                <option value="set">Set</option>
              </select>
            </label>
            <label>
              Balance kind
              <select value={balanceKind} onChange={event => setBalanceKind(event.target.value as AdminBalanceKind)}>
                <option value="paid_elm">ELM</option>
                <option value="demo_teml">tELM</option>
              </select>
            </label>
            <label>
              {operation === 'set' ? 'Final balance' : 'Amount'}
              <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="numeric" />
            </label>
            <label className="admin-reason">
              Reason
              <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={240} />
            </label>
            <div className="admin-preview">
              <span>Preview</span>
              <strong>
                {selectedUser ? `${selectedUser.balance} -> ${balancePreview ?? '-'} ${currencyLabel(balanceKind)}` : 'Select a user'}
              </strong>
            </div>
            <button type="submit" disabled={!selectedUser || !Number.isInteger(parsedAmount) || parsedAmount < 0 || (operation !== 'set' && parsedAmount <= 0) || (balancePreview ?? 0) < 0}>
              Apply
            </button>
          </form>
        </section>
      )}

      {tab === 'audit' && <AuditTable events={audit} />}
    </AdminFrame>
  );
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  return <main className="admin-page">{children}</main>;
}

function Overview({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <section className="admin-section admin-empty">No dashboard data loaded.</section>;
  return (
    <section className="admin-section">
      <div className="admin-metrics">
        <Metric label="DAU" value={stats.users.dau} />
        <Metric label="WAU" value={stats.users.wau} />
        <Metric label="Accounts" value={stats.users.totalAccounts} />
        <Metric label="Online" value={stats.users.onlinePlayers} />
        <Metric label="Matches" value={stats.matches.total} />
        <Metric label="Active" value={stats.matches.active} />
        <Metric label="Queue" value={stats.matches.queued} />
        <Metric label="Bot matches" value={stats.matches.botFallback} />
        <Metric label="Stars" value={stats.payments.starsAmount} />
        <Metric label="Paid ELM" value={stats.balances.paidElm} />
        <Metric label="Demo tELM" value={stats.balances.demoTeml} />
        <Metric label="Season Points" value={stats.balances.seasonPoints} />
        <Metric label="Entry Fees" value={stats.balances.entryFees} />
        <Metric label="Refundable ELM" value={stats.balances.refundableElm} />
      </div>
      <h2>Recent Warnings</h2>
      {stats.recentEvents.length === 0 ? (
        <p className="admin-muted">No recent warning or error events.</p>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Level</th><th>Event</th><th>Message</th></tr>
            </thead>
            <tbody>
              {stats.recentEvents.map(event => (
                <tr key={event.id}>
                  <td>{formatDate(event.createdAt)}</td>
                  <td>{event.level}</td>
                  <td>{event.event}</td>
                  <td>{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function UserTable({ users, onSelect }: { users: AdminUserSummary[]; onSelect(accountId: string): void }) {
  if (users.length === 0) return <p className="admin-muted">No users loaded.</p>;
  return (
    <div className="admin-table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Account</th><th>Balance</th><th>SP</th><th>State</th><th /></tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.accountId}>
              <td>{user.name}</td>
              <td>{user.accountId}</td>
              <td>{user.balance.toLocaleString()} {currencyLabel(user.balanceKind)}</td>
              <td>{user.seasonPoints.toLocaleString()}</td>
              <td>{user.online ? 'online' : user.queued ? 'queued' : user.activeMatchId ? 'match' : '-'}</td>
              <td><button type="button" onClick={() => onSelect(user.accountId)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDetail({ user }: { user: AdminUserDetail | null }) {
  if (!user) return <div className="admin-detail admin-empty">Select a user from search.</div>;
  return (
    <div className="admin-detail">
      <h2>{user.name}</h2>
      <dl>
        <dt>Account</dt><dd>{user.accountId}</dd>
        <dt>Identity</dt><dd>{user.playerIdentity ?? '-'}</dd>
        <dt>Balance</dt><dd>{user.balance.toLocaleString()} {currencyLabel(user.balanceKind)}</dd>
        <dt>Season Points</dt><dd>{user.seasonPoints.toLocaleString()}</dd>
        <dt>Refundable ELM</dt><dd>{user.refundableElm.toLocaleString()}</dd>
        <dt>Rating</dt><dd>{user.rating}</dd>
        <dt>Record</dt><dd>{user.wins}-{user.losses}</dd>
        <dt>State</dt><dd>{user.online ? 'online' : user.queued ? 'queued' : user.activeMatchId ? `match ${user.activeMatchId}` : '-'}</dd>
      </dl>
      {user.balanceEvents.length > 0 ? (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Reason</th><th>Delta</th><th>After</th><th>Actor</th></tr>
            </thead>
            <tbody>
              {user.balanceEvents.map(event => (
                <tr key={event.idempotencyKey}>
                  <td>{formatAdminTime(event.createdAt)}</td>
                  <td>{event.reasonKind}</td>
                  <td>{event.delta > 0 ? '+' : ''}{event.delta.toLocaleString()}</td>
                  <td>{event.balanceAfter.toLocaleString()} {currencyLabel(event.balanceKind)}</td>
                  <td>{event.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function AuditTable({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section className="admin-section">
      {events.length === 0 ? (
        <p className="admin-muted">No audit events for this window.</p>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Admin</th><th>Target</th><th>Operation</th><th>Balance</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.requestId}>
                  <td>{formatDate(event.createdAt)}</td>
                  <td>{event.adminTelegramId}</td>
                  <td>{event.targetAccountId}</td>
                  <td>{event.operation}</td>
                  <td>{`${event.previousBalance} -> ${event.newBalance}`}</td>
                  <td>{event.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function tabLabel(tab: AdminTab): string {
  return tab === 'overview' ? 'Overview' : tab === 'users' ? 'Users' : tab === 'balance' ? 'Balance' : 'Audit';
}

function formatAdminTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function currencyLabel(kind: string): string {
  return kind === 'paid_elm' ? 'ELM' : 'tELM';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function windowConfirm(message: string): boolean {
  return typeof window === 'undefined' ? false : window.confirm(message);
}
