'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
}

interface InvitationResult {
  email: string;
  status: 'success' | 'email_sent' | 'email_pending' | 'email_failed' | 'error';
  message?: string;
}

export function InviteModal({ isOpen, onClose, tripId, tripTitle }: InviteModalProps) {
  const [emails, setEmails] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<InvitationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResults([]);

    // Parse emails (comma or newline separated)
    const emailList = emails
      .split(/[,\n]/)
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);

    if (emailList.length === 0) {
      setError('Please enter at least one email address');
      setIsLoading(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      setError(`Invalid email format: ${invalidEmails.join(', ')}`);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/trips/${tripId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emailList,
          expirationHours: 72, // 3 days
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitations');
      }

      // Process results
      const invitationResults: InvitationResult[] = [];
      
      // Add successful invitations
      if (data.data?.invitations) {
        for (const inv of data.data.invitations) {
          if (inv.email) {
            invitationResults.push({
              email: inv.email,
              status: inv.status || 'success',
              message: inv.message,
            });
          } else if (inv.user?.email) {
            invitationResults.push({
              email: inv.user.email,
              status: 'success',
              message: 'Invitation sent to existing user',
            });
          }
        }
      }

      // Add errors
      if (data.data?.errors) {
        for (const err of data.data.errors) {
          invitationResults.push({
            email: err.email,
            status: 'error',
            message: err.error,
          });
        }
      }

      setResults(invitationResults);
      setEmails('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmails('');
    setResults([]);
    setError(null);
    onClose();
  };

  const getStatusIcon = (status: InvitationResult['status']) => {
    switch (status) {
      case 'success':
      case 'email_sent':
        return (
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'email_pending':
        return (
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'email_failed':
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                  Invite to Trip
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tripTitle}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {results.length === 0 ? (
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Email addresses
                    </label>
                    <textarea
                      value={emails}
                      onChange={(e) => setEmails(e.target.value)}
                      placeholder="Enter email addresses (comma or newline separated)&#10;e.g., friend@email.com, buddy@email.com"
                      rows={4}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                      disabled={isLoading}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Invitations will expire in 3 days. Non-registered users will receive an email to join.
                    </p>
                  </div>

                  {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || !emails.trim()}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:dark:bg-slate-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending invitations...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send Invitations
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div>
                  <div className="mb-4">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-3">
                      Invitation Results
                    </h4>
                    <div className="space-y-2">
                      {results.map((result, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                        >
                          {getStatusIcon(result.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {result.email}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {result.message || (result.status === 'success' ? 'Invitation sent' : result.status)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setResults([])}
                      className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors"
                    >
                      Invite More
                    </button>
                    <button
                      onClick={handleClose}
                      className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default InviteModal;

