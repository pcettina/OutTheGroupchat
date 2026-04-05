'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Navigation } from '@/components/Navigation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemberUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  city?: string | null;
}

interface TripMemberRow {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  departureCity?: string | null;
  user: MemberUser;
}

interface InvitationUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface TripInvitation {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  user: InvitationUser | null;
}

// ─── Role badge helper ────────────────────────────────────────────────────────

const roleConfig: Record<string, { bg: string; text: string; label: string }> = {
  OWNER: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Owner',
  },
  ADMIN: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
    label: 'Admin',
  },
  MEMBER: {
    bg: 'bg-slate-100 dark:bg-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    label: 'Member',
  },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = roleConfig[role] ?? roleConfig.MEMBER;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function Avatar({ user }: { user: MemberUser | InvitationUser }) {
  const initials = user.name?.charAt(0)?.toUpperCase() ?? user.email.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden">
      {user.image ? (
        <Image
          src={user.image}
          alt={user.name ?? user.email}
          width={40}
          height={40}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmDialog({ message, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 max-w-sm w-full"
      >
        <p className="text-slate-900 dark:text-white font-medium mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Remove
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TripMembersPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tripId = params.tripId as string;

  const [members, setMembers] = useState<TripMemberRow[]>([]);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Confirm remove dialog
  const [pendingRemove, setPendingRemove] = useState<TripMemberRow | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Promote to admin state
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersRes, invitationsRes] = await Promise.all([
        fetch(`/api/trips/${tripId}/members`),
        fetch(`/api/trips/${tripId}/invitations`),
      ]);

      if (!membersRes.ok) {
        if (membersRes.status === 401) {
          router.push('/auth/signin');
          return;
        }
        throw new Error('Failed to load members');
      }

      const membersData = await membersRes.json();
      setMembers(membersData.data ?? []);

      if (invitationsRes.ok) {
        const invitationsData = await invitationsRes.json();
        setInvitations(invitationsData.data ?? []);
      }
    } catch {
      setError('Failed to load members. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [tripId, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchData();
    }
  }, [status, fetchData]);

  const currentMember = members.find((m) => m.userId === session?.user?.id);
  const isOwner = currentMember?.role === 'OWNER';
  const isOwnerOrAdmin = isOwner || currentMember?.role === 'ADMIN';

  const sortedMembers = [...members].sort((a, b) => {
    const order: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
    return (order[a.role] ?? 2) - (order[b.role] ?? 2);
  });

  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');

  // ── Remove member ────────────────────────────────────────────────────────

  async function handleRemoveConfirm() {
    if (!pendingRemove) return;
    setRemoveLoading(true);
    setRemoveError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/members?memberId=${encodeURIComponent(pendingRemove.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to remove member');
      }
      setMembers((prev) => prev.filter((m) => m.id !== pendingRemove.id));
      setPendingRemove(null);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveLoading(false);
    }
  }

  // ── Promote to admin ─────────────────────────────────────────────────────

  async function handlePromote(member: TripMemberRow) {
    setPromotingId(member.id);
    setPromoteError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, role: 'ADMIN' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to promote member');
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: 'ADMIN' } : m))
      );
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Failed to promote member');
    } finally {
      setPromotingId(null);
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (status === 'loading' || (isLoading && status === 'authenticated')) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Navigation />
        <div className="pt-20 max-w-3xl mx-auto px-4 py-8">
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-8" />
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Navigation />
        <div className="pt-20 px-4">
          <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Unable to load members
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
              >
                Try Again
              </button>
              <Link
                href={`/trips/${tripId}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Back to Trip
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />

      <div className="pt-20 max-w-3xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/trips/${tripId}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Trip
        </Link>

        {/* Page heading */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Members</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {members.length} {members.length === 1 ? 'member' : 'members'} in this trip
            </p>
          </div>
        </div>

        {/* Inline errors */}
        <AnimatePresence>
          {(removeError || promoteError) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400"
            >
              {removeError ?? promoteError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Members list */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-6"
        >
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Members ({members.length})
            </h2>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {sortedMembers.map((member) => {
              const isSelf = member.userId === session?.user?.id;
              const canRemove =
                isOwnerOrAdmin && member.role !== 'OWNER' && !isSelf;
              const canPromote =
                isOwner && member.role === 'MEMBER';

              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-5 py-4 flex items-center gap-4"
                >
                  <Avatar user={member.user} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {member.user.name ?? member.user.email}
                      </span>
                      {isSelf && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">(you)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <RoleBadge role={member.role} />
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Joined {format(new Date(member.joinedAt), 'MMM d, yyyy')}
                      </span>
                      {member.departureCity && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          · from {member.departureCity}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canPromote && (
                      <button
                        onClick={() => handlePromote(member)}
                        disabled={promotingId === member.id}
                        className="px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 flex items-center gap-1"
                        title="Promote to Admin"
                      >
                        {promotingId === member.id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                        Make Admin
                      </button>
                    )}

                    {canRemove && (
                      <button
                        onClick={() => {
                          setRemoveError(null);
                          setPendingRemove(member);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                        title="Remove member"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Pending invitations — visible to owner/admin */}
        {isOwnerOrAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h2 className="font-semibold text-slate-900 dark:text-white">
                Pending Invitations ({pendingInvitations.length})
              </h2>
            </div>

            {pendingInvitations.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  No pending invitations
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="px-5 py-4 flex items-center gap-4">
                    {invitation.user ? (
                      <Avatar user={invitation.user} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {invitation.user?.name ?? invitation.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          Pending
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Invited {format(new Date(invitation.createdAt), 'MMM d, yyyy')}
                        </span>
                        {invitation.expiresAt && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            · Expires {format(new Date(invitation.expiresAt), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Remove confirmation dialog */}
      <AnimatePresence>
        {pendingRemove && (
          <ConfirmDialog
            message={`Remove ${pendingRemove.user.name ?? pendingRemove.user.email} from this trip?`}
            onConfirm={handleRemoveConfirm}
            onCancel={() => {
              setPendingRemove(null);
              setRemoveError(null);
            }}
            loading={removeLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
