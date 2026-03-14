import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TimerProps {
  seconds: number;
  maxSeconds?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  onExpire?: () => void;
}

export function Timer({
  seconds,
  maxSeconds = 15,
  size = 56,
  strokeWidth = 4,
  className = '',
}: TimerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, seconds / maxSeconds));
  const offset = circumference * (1 - pct);

  // Color based on urgency
  const color =
    seconds <= 3 ? '#ef4444' : seconds <= 7 ? '#eab308' : '#22c55e';

  const isUrgent = seconds <= 5;

  return (
    <motion.div
      className={`relative flex items-center justify-center ${className}`}
      animate={isUrgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={
        isUrgent ? { duration: 0.5, repeat: Infinity } : { duration: 0.1 }
      }
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s',
            filter: isUrgent ? `drop-shadow(0 0 4px ${color})` : 'none',
          }}
        />
      </svg>

      {/* Number */}
      <span
        className="font-black tabular-nums z-10 relative"
        style={{
          color,
          fontSize: size * 0.32,
          lineHeight: 1,
        }}
      >
        {Math.max(0, seconds)}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Countdown hook (for local timer management)
// ---------------------------------------------------------------------------
export function useCountdown(
  initialSeconds: number,
  onExpire?: () => void,
): { seconds: number; reset: (s?: number) => void } {
  const [seconds, setSeconds] = React.useState(initialSeconds);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const start = (s: number) => {
    setSeconds(s);
    if (ref.current) clearInterval(ref.current);
    ref.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(ref.current!);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    start(initialSeconds);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = (s?: number) => start(s ?? initialSeconds);
  return { seconds, reset };
}
