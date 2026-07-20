'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import type {
  NotificationPreferenceResponse,
  UpdateNotificationPreferenceInput,
} from '@/types/notification-preference';
import type { NotificationPreferenceTrigger } from '@prisma/client';

// ============================================
// CONSTANTS
// ============================================

/** The only trigger this control writes to. */
const PER_MEMBER_INTENT: NotificationPreferenceTrigger = 'PER_MEMBER_INTENT';

/** Shared cache key so every toggle on a page reads/writes one preference list. */
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const;

const API_PATH = '/api/users/notification-preferences';

// ============================================
// PARSING
// ============================================

function isTrigger(value: unknown): value is NotificationPreferenceTrigger {
  return (
    value === 'DAILY_PROMPT' ||
    value === 'PER_MEMBER_INTENT' ||
    value === 'GROUP_FORMATION'
  );
}

function toPreference(raw: unknown): NotificationPreferenceResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isTrigger(record.trigger)) return null;
  return {
    trigger: record.trigger,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : false,
    schedule: typeof record.schedule === 'string' ? record.schedule : null,
    perMemberTargets: Array.isArray(record.perMemberTargets)
      ? record.perMemberTargets.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

/** Extracts `data.preferences` from the GET envelope, tolerating a bare array. */
function parsePreferences(body: unknown): NotificationPreferenceResponse[] {
  let list: unknown = body;
  if (typeof body === 'object' && body !== null) {
    const envelope = body as Record<string, unknown>;
    const data = envelope.data;
    if (typeof data === 'object' && data !== null) {
      list = (data as Record<string, unknown>).preferences;
    }
  }
  if (!Array.isArray(list)) return [];
  const result: NotificationPreferenceResponse[] = [];
  for (const item of list) {
    const parsed = toPreference(item);
    if (parsed) result.push(parsed);
  }
  return result;
}

function defaultPerMemberPreference(): NotificationPreferenceResponse {
  return {
    trigger: PER_MEMBER_INTENT,
    enabled: false,
    schedule: null,
    perMemberTargets: [],
  };
}

async function fetchPreferences(): Promise<NotificationPreferenceResponse[]> {
  const res = await fetch(API_PATH);
  if (!res.ok) throw new Error('Failed to load notification preferences');
  const body: unknown = await res.json();
  return parsePreferences(body);
}

// ============================================
// COMPONENT
// ============================================

interface PerMemberIntentToggleProps {
  /** The Crew member being flagged. */
  targetUserId: string;
  targetName?: string | null;
  /** `icon` = compact control (Crew member card). `button` = labelled pill (profile page). */
  variant?: 'icon' | 'button';
  className?: string;
}

/**
 * PerMemberIntentToggle — flag a specific Crew member so their Intents notify you.
 *
 * Writes `NotificationPreference.perMemberTargets` for the PER_MEMBER_INTENT
 * trigger via PATCH /api/users/notification-preferences. Because that endpoint
 * replaces the whole array, the toggle is a read-modify-write over the cached
 * preference list; flagging the first member also switches the trigger on.
 */
export function PerMemberIntentToggle({
  targetUserId,
  targetName,
  variant = 'icon',
  className = '',
}: PerMemberIntentToggleProps) {
  const queryClient = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: fetchPreferences,
    staleTime: 60_000,
  });

  const preference =
    prefsQuery.data?.find((p) => p.trigger === PER_MEMBER_INTENT) ?? defaultPerMemberPreference();

  const flagged = preference.perMemberTargets.includes(targetUserId);

  const mutation = useMutation<
    NotificationPreferenceResponse,
    Error,
    boolean,
    { previous: NotificationPreferenceResponse[] | undefined }
  >({
    mutationFn: async (nextFlagged: boolean) => {
      const current = preference.perMemberTargets;
      const perMemberTargets = nextFlagged
        ? Array.from(new Set([...current, targetUserId]))
        : current.filter((id) => id !== targetUserId);

      const payload: UpdateNotificationPreferenceInput = {
        trigger: PER_MEMBER_INTENT,
        // Turning on the first target opts the trigger in; removing one never
        // opts the user back out.
        enabled: nextFlagged ? true : preference.enabled,
        perMemberTargets,
      };

      const res = await fetch(API_PATH, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof body === 'object' && body !== null
            ? ((body as Record<string, unknown>).error as string | undefined)
            : undefined;
        throw new Error(
          res.status === 429
            ? 'Too many requests — please wait a moment and try again.'
            : message ?? 'Failed to update notification preference'
        );
      }
      const updated =
        typeof body === 'object' && body !== null
          ? toPreference((body as Record<string, unknown>).data)
          : null;
      return updated ?? defaultPerMemberPreference();
    },
    onMutate: async (nextFlagged: boolean) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferenceResponse[]>(
        NOTIFICATION_PREFERENCES_QUERY_KEY
      );

      const base = previous ?? [defaultPerMemberPreference()];
      const hasRow = base.some((p) => p.trigger === PER_MEMBER_INTENT);
      const rows = hasRow ? base : [...base, defaultPerMemberPreference()];

      const optimistic = rows.map((p) => {
        if (p.trigger !== PER_MEMBER_INTENT) return p;
        return {
          ...p,
          enabled: nextFlagged ? true : p.enabled,
          perMemberTargets: nextFlagged
            ? Array.from(new Set([...p.perMemberTargets, targetUserId]))
            : p.perMemberTargets.filter((id) => id !== targetUserId),
        };
      });

      queryClient.setQueryData<NotificationPreferenceResponse[]>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
        optimistic
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<NotificationPreferenceResponse[]>(
          NOTIFICATION_PREFERENCES_QUERY_KEY,
          context.previous
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
    },
  });

  const displayName = targetName?.trim() ? targetName.trim() : 'this member';
  const busy = mutation.isPending;
  const disabled = busy || prefsQuery.isLoading;
  const error = mutation.error?.message ?? null;

  const label = flagged
    ? `Stop notifying me when ${displayName} signals an Intent`
    : `Notify me when ${displayName} signals an Intent`;

  const onToggle = () => {
    if (disabled) return;
    mutation.mutate(!flagged);
  };

  const Icon = flagged ? Bell : BellOff;

  if (variant === 'button') {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={flagged}
          aria-label={label}
          title={label}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
            flagged
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-white text-slate-500 border border-slate-200 hover:text-emerald-600 hover:border-emerald-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:text-emerald-400'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {flagged ? 'Notifying' : 'Notify me'}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={flagged}
      aria-label={label}
      title={error ?? label}
      className={`p-2 rounded-full transition disabled:opacity-60 ${
        flagged
          ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
          : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
      } ${error ? 'text-red-500' : ''} ${className}`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

export default PerMemberIntentToggle;
