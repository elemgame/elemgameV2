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
        background: 'rgba(10, 10, 26, 0.82)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(14px)',
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
