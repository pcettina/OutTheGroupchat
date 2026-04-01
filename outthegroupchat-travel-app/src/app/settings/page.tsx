'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { PrivacySettings } from '@/components/settings/PrivacySettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

type Tab = 'profile' | 'notifications' | 'privacy' | 'security';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'privacy', label: 'Privacy', icon: '🔒' },
  { id: 'security', label: 'Security', icon: '🛡️' },
];

type NotificationSettingsData = {
  email: {
    tripUpdates: boolean;
    newFollowers: boolean;
    messages: boolean;
    marketing: boolean;
    weeklyDigest: boolean;
  };
  push: {
    tripUpdates: boolean;
    newFollowers: boolean;
    messages: boolean;
    votingReminders: boolean;
    tripReminders: boolean;
  };
};

type PrivacySettingsData = {
  profileVisibility: 'public' | 'friends' | 'private';
  showEmail: boolean;
  showCity: boolean;
  showTrips: boolean;
  allowFriendRequests: boolean;
  allowMessages: 'everyone' | 'friends' | 'none';
  showOnlineStatus: boolean;
  allowTagging: boolean;
};

const defaultNotificationSettings: NotificationSettingsData = {
  email: {
    tripUpdates: true,
    newFollowers: true,
    messages: true,
    marketing: false,
    weeklyDigest: true,
  },
  push: {
    tripUpdates: true,
    newFollowers: false,
    messages: true,
    votingReminders: true,
    tripReminders: true,
  },
};

const defaultPrivacySettings: PrivacySettingsData = {
  profileVisibility: 'public',
  showEmail: false,
  showCity: true,
  showTrips: true,
  allowFriendRequests: true,
  allowMessages: 'everyone',
  showOnlineStatus: true,
  allowTagging: true,
};

const defaultSessions = [
  {
    id: 'current-session',
    device: 'Current Browser',
    location: 'Unknown',
    lastActive: 'Now',
    current: true,
  },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const { user } = session;

  const handleProfileSave = async (data: Partial<{ name: string; email: string; bio?: string; city?: string; image?: string }>) => {
    await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  };

  const handleNotificationSave = async (settings: NotificationSettingsData) => {
    await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationSettings: settings }),
    });
  };

  const handlePrivacySave = async (settings: PrivacySettingsData) => {
    await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privacySettings: settings }),
    });
  };

  const handleChangePassword = () => {
    router.push('/auth/signin');
  };

  const handleEnableTwoFactor = () => {
    // 2FA setup flow — placeholder for future implementation
  };

  const handleDisableTwoFactor = () => {
    // 2FA disable flow — placeholder for future implementation
  };

  const handleConnectAccount = (_provider: 'google' | 'apple') => {
    // OAuth connect flow — placeholder for future implementation
  };

  const handleDisconnectAccount = (_provider: 'google' | 'apple') => {
    // OAuth disconnect flow — placeholder for future implementation
  };

  const handleRevokeSession = (_sessionId: string) => {
    // Session revoke — placeholder for future implementation
  };

  const handleRevokeAllSessions = () => {
    // Revoke all sessions — placeholder for future implementation
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Settings
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your account preferences and privacy
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tab Navigation — vertical on desktop, horizontal on mobile */}
          <nav className="flex md:flex-col gap-1 md:w-48 md:shrink-0 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all text-left ${
                  activeTab === tab.id
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'profile' && (
              <ProfileSettings
                user={{
                  name: user.name ?? '',
                  email: user.email ?? '',
                  bio: undefined,
                  city: undefined,
                  image: user.image ?? undefined,
                }}
                onSave={handleProfileSave}
              />
            )}

            {activeTab === 'notifications' && (
              <NotificationSettings
                settings={defaultNotificationSettings}
                onSave={handleNotificationSave}
              />
            )}

            {activeTab === 'privacy' && (
              <PrivacySettings
                settings={defaultPrivacySettings}
                onSave={handlePrivacySave}
              />
            )}

            {activeTab === 'security' && (
              <SecuritySettings
                hasPassword={false}
                hasTwoFactor={false}
                connectedAccounts={{ google: false }}
                sessions={defaultSessions}
                onChangePassword={handleChangePassword}
                onEnableTwoFactor={handleEnableTwoFactor}
                onDisableTwoFactor={handleDisableTwoFactor}
                onConnectAccount={handleConnectAccount}
                onDisconnectAccount={handleDisconnectAccount}
                onRevokeSession={handleRevokeSession}
                onRevokeAllSessions={handleRevokeAllSessions}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
