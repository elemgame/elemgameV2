import { motion } from 'framer-motion';
import { openBugReportIssue } from '../services/bugReport';
import { haptic } from '../services/telegram';
import { ReportIcon } from './icons/ReportIcon';

export function ReportBugButton() {
  return (
    <motion.button
      data-nav
      aria-label="Report bug"
      title="Report bug"
      className="absolute z-50 flex h-10 w-10 items-center justify-center rounded-xl"
      style={{
        right: 'calc(var(--elmental-safe-right) + 12px)',
        bottom: 'calc(var(--elmental-safe-bottom) + 12px)',
        background: 'oklch(21% 0.045 252 / 0.9)',
        border: '1px solid oklch(43% 0.055 252 / 0.72)',
        boxShadow: '0 12px 26px oklch(3% 0.02 252 / 0.46)',
      }}
      whileTap={{ scale: 0.94 }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        haptic.light();
        openBugReportIssue();
      }}
    >
      <ReportIcon size={21} className="text-energy-mid" />
    </motion.button>
  );
}
