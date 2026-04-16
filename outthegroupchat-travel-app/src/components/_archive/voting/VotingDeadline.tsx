'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays, format } from 'date-fns';

interface VotingDeadlineProps {
  expiresAt: string;
  onExpire?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function VotingDeadline({ expiresAt, onExpire, size = 'md' }: VotingDeadlineProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const deadline = new Date(expiresAt);
      const totalSeconds = differenceInSeconds(deadline, now);

      if (totalSeconds <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        onExpire?.();
        return;
      }

      const days = differenceInDays(deadline, now);
      const hours = differenceInHours(deadline, now) % 24;
      const minutes = differenceInMinutes(deadline, now) % 60;
      const seconds = totalSeconds % 60;

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 1;
  const isWarning = timeLeft.days === 0 && timeLeft.hours < 6;

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  if (timeLeft.isExpired) {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]}`}>
        <span className="text-red-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <span className="text-red-600 dark:text-red-400 font-medium">Voting ended</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${sizeClasses[size]}`}>
      <div className={`flex items-center gap-1.5 ${
        isUrgent
          ? 'text-red-500'
          : isWarning
          ? 'text-amber-500'
          : 'text-emerald-500'
      }`}>
        <motion.svg
          animate={isUrgent ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </motion.svg>
      </div>

      <div className="flex items-center gap-1">
        {timeLeft.days > 0 && (
          <TimeUnit value={timeLeft.days} label="d" isUrgent={isUrgent} isWarning={isWarning} />
        )}
        <TimeUnit value={timeLeft.hours} label="h" isUrgent={isUrgent} isWarning={isWarning} />
        <TimeUnit value={timeLeft.minutes} label="m" isUrgent={isUrgent} isWarning={isWarning} />
        {timeLeft.days === 0 && (
          <TimeUnit value={timeLeft.seconds} label="s" isUrgent={isUrgent} isWarning={isWarning} animate />
        )}
      </div>

      <span className="text-slate-500 dark:text-slate-400">
        remaining
      </span>
    </div>
  );
}

function TimeUnit({
  value,
  label,
  isUrgent,
  isWarning,
  animate = false,
}: {
  value: number;
  label: string;
  isUrgent: boolean;
  isWarning: boolean;
  animate?: boolean;
}) {
  return (
    <motion.span
      key={value}
      initial={animate ? { opacity: 0, y: -5 } : false}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      className={`font-mono font-semibold ${
        isUrgent
          ? 'text-red-600 dark:text-red-400'
          : isWarning
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-900 dark:text-white'
      }`}
    >
      {String(value).padStart(2, '0')}{label}
    </motion.span>
  );
}

// Compact version for cards
export function VotingDeadlineCompact({ expiresAt }: { expiresAt: string }) {
  const deadline = new Date(expiresAt);
  const now = new Date();
  const isExpired = deadline < now;

  if (isExpired) {
    return (
      <span className="text-xs text-red-500 dark:text-red-400">
        Ended
      </span>
    );
  }

  const days = differenceInDays(deadline, now);
  const hours = differenceInHours(deadline, now) % 24;

  if (days > 0) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {days}d {hours}h left
      </span>
    );
  }

  const minutes = differenceInMinutes(deadline, now) % 60;
  return (
    <span className={`text-xs ${hours < 1 ? 'text-red-500' : 'text-amber-500'}`}>
      {hours}h {minutes}m left
    </span>
  );
}

export default VotingDeadline;
