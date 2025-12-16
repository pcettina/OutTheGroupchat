'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TripMember, User } from '@prisma/client';

interface MemberWithUser extends TripMember {
  user: User;
}

interface MemberListProps {
  members: MemberWithUser[];
  onInvite?: () => void;
  onRemoveMember?: (memberId: string) => void;
  isOwner?: boolean;
}

const roleColors: Record<string, { bg: string; text: string }> = {
  OWNER: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  ADMIN: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  MEMBER: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400' },
};

export default function MemberList({ members, onInvite, onRemoveMember, isOwner = false }: MemberListProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
    return (roleOrder[a.role as keyof typeof roleOrder] || 2) - (roleOrder[b.role as keyof typeof roleOrder] || 2);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Members ({members.length})
        </h3>
        {onInvite && (
          <button
            onClick={onInvite}
            className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite
          </button>
        )}
      </div>

      {/* Member List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {sortedMembers.map((member) => {
          const roleStyle = roleColors[member.role] || roleColors.MEMBER;
          const isExpanded = expandedMember === member.userId;

          return (
            <motion.div
              key={member.userId}
              initial={false}
              className="relative"
            >
              <button
                onClick={() => setExpandedMember(isExpanded ? null : member.userId)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                    {member.user.image ? (
                      <img
                        src={member.user.image}
                        alt={member.user.name || ''}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      member.user.name?.charAt(0) || '?'
                    )}
                  </div>
                  {/* Online indicator (mock) */}
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {member.user.name || 'Unknown'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                      {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                    </span>
                    {member.departureCity && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        from {member.departureCity}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand Icon */}
                <motion.svg
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  className="w-5 h-5 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </motion.svg>
              </button>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 pt-1 space-y-3">
                      {/* Member Details */}
                      {member.user.city && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          Lives in {member.user.city}
                        </div>
                      )}

                      {/* Budget Range */}
                      {member.budgetRange && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Budget: ${(member.budgetRange as any)?.min?.toLocaleString()} - ${(member.budgetRange as any)?.max?.toLocaleString()}
                        </div>
                      )}

                      {/* Flight Details */}
                      {member.flightDetails && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Flight booked
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <button className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                          View Profile
                        </button>
                        {isOwner && member.role !== 'OWNER' && onRemoveMember && (
                          <button
                            onClick={() => onRemoveMember(member.userId)}
                            className="px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {members.length === 0 && (
        <div className="px-5 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-1">No members yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Invite friends to join this trip
          </p>
        </div>
      )}
    </motion.div>
  );
}
