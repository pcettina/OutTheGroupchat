'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/Switch';

interface SecuritySettingsProps {
  hasPassword: boolean;
  hasTwoFactor: boolean;
  connectedAccounts: {
    google?: boolean;
    apple?: boolean;
  };
  sessions: {
    id: string;
    device: string;
    location: string;
    lastActive: string;
    current: boolean;
  }[];
  onChangePassword: () => void;
  onEnableTwoFactor: () => void;
  onDisableTwoFactor: () => void;
  onConnectAccount: (provider: 'google' | 'apple') => void;
  onDisconnectAccount: (provider: 'google' | 'apple') => void;
  onRevokeSession: (sessionId: string) => void;
  onRevokeAllSessions: () => void;
}

export function SecuritySettings({
  hasPassword,
  hasTwoFactor,
  connectedAccounts,
  sessions,
  onChangePassword,
  onEnableTwoFactor,
  onDisableTwoFactor,
  onConnectAccount,
  onDisconnectAccount,
  onRevokeSession,
  onRevokeAllSessions,
}: SecuritySettingsProps) {
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Password */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Password
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your password settings
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {hasPassword ? 'Password set' : 'No password set'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {hasPassword ? 'Last changed: 30 days ago' : 'Set a password for additional security'}
                </p>
              </div>
            </div>
            <button
              onClick={onChangePassword}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              {hasPassword ? 'Change' : 'Set password'}
            </button>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Two-Factor Authentication
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add an extra layer of security
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                hasTwoFactor
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-amber-100 dark:bg-amber-900/30'
              }`}>
                {hasTwoFactor ? (
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {hasTwoFactor ? '2FA enabled' : '2FA disabled'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {hasTwoFactor ? 'Your account has extra protection' : 'Recommended for better security'}
                </p>
              </div>
            </div>
            <button
              onClick={hasTwoFactor ? onDisableTwoFactor : onEnableTwoFactor}
              className={`px-4 py-2 font-medium rounded-lg transition-colors ${
                hasTwoFactor
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {hasTwoFactor ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Connected Accounts
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your connected social accounts
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Google */}
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Google</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {connectedAccounts.google ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={() => connectedAccounts.google ? onDisconnectAccount('google') : onConnectAccount('google')}
              className={`px-4 py-2 font-medium rounded-lg text-sm transition-colors ${
                connectedAccounts.google
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {connectedAccounts.google ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Active Sessions
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage devices logged into your account
            </p>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={() => setShowRevokeConfirm(true)}
              className="text-sm text-red-600 dark:text-red-400 font-medium hover:underline"
            >
              Sign out all
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    {session.device}
                    {session.current && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {session.location} · {session.lastActive}
                  </p>
                </div>
              </div>
              {!session.current && (
                <button
                  onClick={() => onRevokeSession(session.id)}
                  className="text-sm text-red-600 dark:text-red-400 font-medium hover:underline"
                >
                  Sign out
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Revoke All Confirmation Modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Sign out all devices?
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              This will sign you out of all devices except this one. You'll need to sign in again on those devices.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRevokeConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRevokeAllSessions();
                  setShowRevokeConfirm(false);
                }}
                className="flex-1 py-2.5 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors"
              >
                Sign out all
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default SecuritySettings;
