'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  city?: string | null;
}

type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  departureCity: string | null;
  budgetRange: unknown;
  flightDetails: unknown;
  user: MemberUser;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_STYLES: Record<MemberRole, { bg: string; text: string; label: string }> = {
  OWNER: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Owner' },
  ADMIN: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', label: 'Admin' },
  MEMBER: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Member' },
};

const ROLE_ORDER: Record<MemberRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MemberAvatarProps {
  user: MemberUser;
  size?: number;
}

function MemberAvatar({ user, size = 44 }: MemberAvatarProps) {
  const initials = user.name?.charAt(0).toUpperCase() ?? '?';
  return (
    <div
      className="rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {user.image ? (
        <Image
          src={user.image}
          alt={user.name ?? 'Member avatar'}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

interface RoleBadgeProps {
  role: MemberRole;
}

function RoleBadge({ role }: RoleBadgeProps) {
  const style = ROLE_STYLES[role];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MemberSkeleton() {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-700">
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
          <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: TripMember;
  currentUserId: string | undefined;
  canManage: boolean;
  onChangeRole: (memberId: string, newRole: 'ADMIN' | 'MEMBER') => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  isActionPending: boolean;
}

function MemberRow({ member, currentUserId, canManage, onChangeRole, onRemove, isActionPending }: MemberRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isCurrentUser = member.userId === currentUserId;
  const isOwner = member.role === 'OWNER';
  const canModify = canManage && !isOwner && !isCurrentUser;

  const toggleRole = () => {
    const newRole: 'ADMIN' | 'MEMBER' = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    onChangeRole(member.id, newRole).catch((err: unknown) => {
      logger.error({ err, context: 'MemberRow.toggleRole' }, 'Failed to change member role');
    });
  };

  const handleRemove = () => {
    onRemove(member.id).catch((err: unknown) => {
      logger.error({ err, context: 'MemberRow.handleRemove' }, 'Failed to remove member');
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border-b border-slate-100 dark:border-slate-700 last:border-0"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
        aria-expanded={expanded}
      >
        <MemberAvatar user={member.user} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 dark:text-white truncate">
            {member.user.name ?? 'Unknown'}
            {isCurrentUser && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(you)</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <RoleBadge role={member.role} />
            {member.departureCity && (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                from {member.departureCity}
              </span>
            )}
          </div>
        </div>
        <motion.svg
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-5 h-5 text-slate-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-1 space-y-3">
              {member.user.email && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{member.user.email}</p>
              )}
              {member.user.city && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Lives in {member.user.city}
                </div>
              )}
              {canModify && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={toggleRole}
                    disabled={isActionPending}
                    className="flex-1 px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {member.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={isActionPending}
                    className="px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TripMembersPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tripId = params.tripId as string;

  const [members, setMembers] = useState<TripMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/trips/${tripId}/members`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { success: boolean; data: TripMember[] };
      setMembers(json.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load members';
      logger.error({ err, context: 'TripMembersPage.fetchMembers' }, message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMembers();
    }
  }, [status, fetchMembers]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChangeRole = async (memberId: string, newRole: 'ADMIN' | 'MEMBER') => {
    setActionPending(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role: newRole }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { success: boolean; data: TripMember };
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: json.data.role } : m))
      );
      showToast('Role updated successfully', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      logger.error({ err, context: 'TripMembersPage.handleChangeRole' }, message);
      showToast(message, 'error');
    } finally {
      setActionPending(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setActionPending(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/members?memberId=${memberId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showToast('Member removed', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member';
      logger.error({ err, context: 'TripMembersPage.handleRemoveMember' }, message);
      showToast(message, 'error');
    } finally {
      setActionPending(false);
    }
  };

  // Derive current user's role
  const currentMember = members.find((m) => m.userId === session?.user?.id);
  const canManage =
    currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

  const sortedMembers = [...members].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2)
  );

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="max-w-2xl mx-auto px-4 pt-20">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 mb-6 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-40" />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 animate-pulse">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-32" />
            </div>
            <MemberSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center max-w-sm w-full">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Failed to load members</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <div className="flex gap-3">
            <Link
              href={`/trips/${tripId}`}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-center"
            >
              Back to trip
            </Link>
            <button
              onClick={fetchMembers}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-16">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href={`/trips/${tripId}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to trip
          </Link>
        </div>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Trip Members
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {members.length} {members.length === 1 ? 'member' : 'members'} in this trip
          </p>
        </motion.div>

        {/* Members list card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Members ({members.length})
            </h2>
          </div>

          {members.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">No members yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Invite friends to join this trip
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {sortedMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  currentUserId={session?.user?.id}
                  canManage={canManage}
                  onChangeRole={handleChangeRole}
                  onRemove={handleRemoveMember}
                  isActionPending={actionPending}
                />
              ))}
            </AnimatePresence>
          )}
        </motion.div>

        {/* Permission hint for regular members */}
        {!canManage && members.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500"
          >
            Only owners and admins can manage member roles.
          </motion.p>
        )}
      </div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white z-50 ${
              toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
