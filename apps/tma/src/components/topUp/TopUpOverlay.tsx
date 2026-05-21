import React from 'react';
import { MATCH_ENTRY_FEE } from '@elmental/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useGameStore, type TelegramUser } from '../../stores/gameStore';
import { refreshTelegramBalance } from '../../services/gameService';
import { haptic } from '../../services/telegram';
import {
  isPaymentsServiceConfigured,
  isTelegramStarsInvoiceAvailable,
  openTelegramStarsInvoice,
  requestStarsInvoice,
  requestStarsRefund,
  requestStarsRefundQuote,
  type ElmStarsPackageId,
  type StarsRefundQuote,
  type TelegramInvoiceStatus,
} from '../../services/payments';
import { currencyForUser, formatCurrencyAmount } from '../../services/economy';
import {
  findTopUpPackage,
  nextDemoBalance,
  topUpPackagesForCurrency,
  topUpStateForInvoiceStatus,
  type TopUpMode,
  type TopUpState,
} from '../../services/topUp';
import { CoinsIcon } from '../icons/CoinsIcon';
import { CrossIcon } from '../icons/CrossIcon';
import { TelegramStarsIcon } from '../icons/TelegramStarsIcon';
import { TopUpWidget } from './TopUpWidget';

interface TopUpOverlayProps {
  className?: string;
}

interface RefundState {
  status: 'idle' | 'loading' | 'ready' | 'refunded' | 'failed';
  quote?: StarsRefundQuote;
  message?: string;
}

export function TopUpOverlay({ className = '' }: TopUpOverlayProps) {
  const { telegramUser, elmBalance } = useGameStore();
  const [isOpen, setIsOpen] = React.useState(false);
  const [topUpState, setTopUpState] = React.useState<TopUpState>({ status: 'idle' });
  const [refundState, setRefundState] = React.useState<RefundState>({ status: 'idle' });

  const currency = currencyForUser(telegramUser);
  const topUpMode: TopUpMode = telegramUser?.source === 'telegram' ? 'telegram' : 'demo';
  const topUpPackages = topUpPackagesForCurrency(currency);
  const topUpUnavailableMessage = topUpUnavailableReason(topUpMode, telegramUser);
  const effectiveTopUpState: TopUpState = topUpUnavailableMessage
    ? { status: 'unavailable', message: topUpUnavailableMessage }
    : topUpState;
  const showRefundControls = topUpMode === 'telegram' && Boolean(telegramUser?.initData);
  const isTelegram = topUpMode === 'telegram';
  const overlayRoot = typeof document === 'undefined' ? null : document.body;

  const close = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isOpen]);

  const open = () => {
    haptic.light();
    setIsOpen(true);
  };

  const handleTopUp = async (packageId: ElmStarsPackageId) => {
    if (topUpUnavailableMessage) {
      haptic.error();
      setTopUpState({ status: 'unavailable', message: topUpUnavailableMessage });
      return;
    }

    if (topUpMode === 'demo') {
      handleDemoTopUp(packageId);
      return;
    }

    const initData = telegramUser?.initData ?? '';
    if (!initData) {
      haptic.error();
      setTopUpState({ status: 'unavailable', message: 'Payment unavailable in this session.' });
      return;
    }

    haptic.selection();
    setTopUpState({ status: 'loading_invoice', packageId, message: 'Opening Stars invoice...' });

    try {
      const invoice = await requestStarsInvoice({ initData, packageId });
      const invoiceStatus = await openTelegramStarsInvoice(invoice.invoiceLink);
      setTopUpState(topUpStateForInvoiceStatus(invoiceStatus));
      notifyInvoiceStatus(invoiceStatus);
      if (invoiceStatus === 'paid' && telegramUser) {
        schedulePaidBalanceSync(telegramUser, elmBalance + invoice.package.elmAmount, () => {
          setTopUpState({ status: 'success', packageId, message: 'Balance updated.' });
        });
      }
    } catch {
      haptic.error();
      setTopUpState({ status: 'failed', message: 'Payment failed.' });
    }
  };

  const handleDemoTopUp = (packageId: ElmStarsPackageId) => {
    const pkg = findTopUpPackage(packageId);
    haptic.selection();
    setTopUpState({ status: 'loading_invoice', packageId, message: 'Adding demo tELM...' });

    window.setTimeout(() => {
      const state = useGameStore.getState();
      state.setPlayerStats({
        elmBalance: nextDemoBalance(state.elmBalance, packageId),
        rating: state.rating,
        wins: state.stats.wins,
        losses: state.stats.losses,
        seasonPoints: state.seasonPoints,
      });
      haptic.success();
      setTopUpState({
        status: 'success',
        packageId,
        message: `Added ${pkg.elmAmount.toLocaleString()} demo tELM.`,
      });
    }, 160);
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

  const overlay = (
    <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="top-up-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="top-up-title"
              className="top-up-sheet"
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
                    {isTelegram ? <TelegramStarsIcon size={14} /> : <CoinsIcon size={14} />}
                    {isTelegram ? 'Telegram Stars' : 'Demo credits'}
                  </div>
                  <h2 id="top-up-title" className="mt-1 text-2xl font-black leading-none text-text-primary">
                    TOP UP
                  </h2>
                </div>
                <button
                  data-nav
                  type="button"
                  className="hud-icon-button flex shrink-0 items-center justify-center"
                  aria-label="Close top up"
                  onClick={close}
                >
                  <CrossIcon size={16} className="text-text-secondary" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-xl border px-3 py-3"
                style={{ borderColor: 'oklch(78% 0.15 83 / 0.22)', background: 'oklch(8% 0.03 252 / 0.62)' }}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                    Current balance
                  </div>
                  <div className="mt-1 text-3xl font-black tabular-nums text-gold">
                    {elmBalance.toLocaleString()}
                  </div>
                </div>
                <div className="pb-1 text-right text-xs font-black text-text-secondary">
                  {currency}
                </div>
              </div>

              <TopUpWidget
                mode={topUpMode}
                packages={topUpPackages}
                state={effectiveTopUpState}
                onSelectPackage={(packageId) => void handleTopUp(packageId)}
              />

              <div className="mt-4 rounded-xl border px-3 py-3 text-xs font-semibold leading-snug text-text-secondary"
                style={{ borderColor: 'oklch(78% 0.15 83 / 0.2)', background: 'oklch(18% 0.044 72 / 0.5)' }}
              >
                Entry fee: {formatCurrencyAmount(MATCH_ENTRY_FEE, currency)}
              </div>

              {showRefundControls ? (
                <div className="mt-4 border-t border-bg-border pt-4 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      data-nav
                      type="button"
                      className="min-h-[38px] rounded-xl border px-3 py-2 text-xs font-bold text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'oklch(10% 0.035 252 / 0.48)', borderColor: 'oklch(43% 0.055 252 / 0.58)' }}
                      disabled={refundState.status === 'loading'}
                      onClick={() => void handleRefundQuote()}
                    >
                      Refund unused ELM
                    </button>
                    {refundState.quote?.nextLot ? (
                      <button
                        data-nav
                        type="button"
                        className="min-h-[38px] rounded-xl border px-3 py-2 text-xs font-black text-gold disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: 'oklch(32% 0.09 83 / 0.42)', borderColor: 'oklch(78% 0.15 83 / 0.55)' }}
                        disabled={refundState.status === 'loading'}
                        onClick={() => void handleRefundNextLot()}
                      >
                        {refundState.quote.nextLot.starsAmount} Stars / {refundState.quote.nextLot.elmAmount} ELM
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
              ) : null}
            </motion.section>
          </motion.div>
        ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <motion.button
        data-nav
        type="button"
        className={`top-up-balance-action ${className}`}
        aria-label="Open top up"
        title="Top up"
        whileTap={{ scale: 0.94 }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          open();
        }}
      >
        <span className="top-up-balance-action-mark" aria-hidden="true">
          <span className="top-up-balance-action-plus">+</span>
          <span className="top-up-balance-action-icon">
            {isTelegram ? <TelegramStarsIcon size={19} /> : <CoinsIcon size={19} />}
          </span>
        </span>
        <span>Top up</span>
      </motion.button>

      {overlayRoot ? createPortal(overlay, overlayRoot) : overlay}
    </>
  );
}

function topUpUnavailableReason(mode: TopUpMode, user: TelegramUser | null): string | null {
  if (mode === 'demo') return null;
  if (!user?.initData) return 'Payment unavailable in this session.';
  if (!isPaymentsServiceConfigured()) return 'Payment unavailable in this session.';
  if (!isTelegramStarsInvoiceAvailable()) return 'Payment unavailable in this session.';
  return null;
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

function schedulePaidBalanceSync(user: TelegramUser, expectedBalance: number, onConfirmed?: () => void): void {
  let confirmed = false;
  const confirmOnce = () => {
    if (confirmed) return;
    confirmed = true;
    onConfirmed?.();
  };

  for (const delayMs of [0, 1_000, 2_500, 5_000, 9_000, 14_000]) {
    window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.telegramUser?.source !== 'telegram' || state.telegramUser.id !== user.id) return;
      if (state.elmBalance >= expectedBalance) {
        confirmOnce();
        return;
      }
      void refreshTelegramBalance(state.telegramUser).then(() => {
        const latest = useGameStore.getState();
        if (latest.telegramUser?.source !== 'telegram' || latest.telegramUser.id !== user.id) return;
        if (latest.elmBalance >= expectedBalance) confirmOnce();
      }).catch(() => {});
    }, delayMs);
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
