import { motion } from 'framer-motion';
import type { TopUpMode, TopUpPackage, TopUpState } from '../../services/topUp';
import type { ElmStarsPackageId } from '../../services/payments';
import { TelegramStarsIcon } from '../icons/TelegramStarsIcon';
import { CoinsIcon } from '../icons/CoinsIcon';

interface TopUpWidgetProps {
  mode: TopUpMode;
  packages: readonly TopUpPackage[];
  state: TopUpState;
  onSelectPackage: (packageId: ElmStarsPackageId) => void;
}

export function TopUpWidget({ mode, packages, state, onSelectPackage }: TopUpWidgetProps) {
  const isTelegram = mode === 'telegram';
  const disabled = state.status === 'loading_invoice' || state.status === 'unavailable';
  const activePackageId = state.status === 'loading_invoice' ? state.packageId : undefined;

  return (
    <div className="mt-4 text-left">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <div className="text-xs text-text-secondary font-semibold tracking-widest uppercase">
            Packages
          </div>
          <div className="text-[11px] text-text-muted font-semibold leading-tight">
            {isTelegram ? 'ELM match credits' : 'Demo tELM credits'}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-bold text-gold">
          {isTelegram ? <TelegramStarsIcon size={12} /> : <CoinsIcon size={12} />}
          {isTelegram ? 'Stars' : 'Demo'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {packages.map((pkg) => {
          const isActive = activePackageId === pkg.id;
          return (
            <motion.button
              key={pkg.id}
              data-nav
              type="button"
              className="min-h-[62px] rounded-xl border px-2 py-2 flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                borderColor: isActive ? 'oklch(78% 0.15 83)' : 'oklch(72% 0.04 73 / 0.46)',
                background: isActive ? 'oklch(31% 0.082 76 / 0.66)' : 'oklch(11% 0.032 252 / 0.62)',
                boxShadow: isActive ? '0 10px 20px oklch(78% 0.15 83 / 0.22)' : '0 5px 12px oklch(3% 0.02 252 / 0.3)',
              }}
              disabled={disabled}
              whileTap={!disabled ? { scale: 0.96 } : undefined}
              aria-label={packageAriaLabel(mode, pkg)}
              onClick={() => onSelectPackage(pkg.id)}
            >
              <span className="flex items-center justify-center gap-1 text-sm font-black text-gold leading-none">
                {isTelegram ? <TelegramStarsIcon size={13} /> : <CoinsIcon size={13} />}
                {isTelegram ? pkg.starsAmount : `+${pkg.elmAmount.toLocaleString()}`}
              </span>
              <span className="text-[11px] font-bold text-text-primary leading-tight text-center">
                {isTelegram
                  ? `${pkg.elmAmount.toLocaleString()} ELM`
                  : `${pkg.currency} demo`}
              </span>
            </motion.button>
          );
        })}
      </div>

      {state.message ? (
        <div
          role="status"
          className={`mt-3 text-xs font-semibold leading-tight ${topUpStatusClass(state.status)}`}
        >
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

function packageAriaLabel(mode: TopUpMode, pkg: TopUpPackage): string {
  if (mode === 'telegram') {
    const starLabel = pkg.starsAmount === 1 ? 'Star' : 'Stars';
    return `Add ${pkg.elmAmount} ELM for ${pkg.starsAmount} ${starLabel}`;
  }
  return `Add ${pkg.elmAmount} demo tELM`;
}

function topUpStatusClass(status: TopUpState['status']): string {
  switch (status) {
    case 'success':
      return 'text-energy-high';
    case 'failed':
    case 'unavailable':
      return 'text-energy-low';
    case 'pending':
    case 'loading_invoice':
      return 'text-water-light';
    case 'canceled':
      return 'text-text-muted';
    case 'idle':
      return 'text-text-secondary';
  }
}
