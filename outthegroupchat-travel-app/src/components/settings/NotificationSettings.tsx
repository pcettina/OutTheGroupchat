'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/Switch';

interface NotificationSettingsData {
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
}

interface NotificationSettingsProps {
  settings: NotificationSettingsData;
  onSave: (settings: NotificationSettingsData) => Promise<void>;
}

export function NotificationSettings({ settings: initialSettings, onSave }: NotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationSettingsData>(initialSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateEmailSetting = (key: keyof NotificationSettingsData['email'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      email: { ...prev.email, [key]: value },
    }));
    setHasChanges(true);
  };

  const updatePushSetting = (key: keyof NotificationSettingsData['push'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      push: { ...prev.push, [key]: value },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await onSave(settings);
      setHasChanges(false);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAllEmail = (enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      email: Object.keys(prev.email).reduce((acc, key) => ({
        ...acc,
        [key]: enabled,
      }), {} as NotificationSettingsData['email']),
    }));
    setHasChanges(true);
  };

  const toggleAllPush = (enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      push: Object.keys(prev.push).reduce((acc, key) => ({
        ...acc,
        [key]: enabled,
      }), {} as NotificationSettingsData['push']),
    }));
    setHasChanges(true);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Notification Preferences
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose how and when you want to be notified
        </p>
      </div>

      <div className="p-6 space-y-8">
        {/* Email Notifications */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-xl">📧</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Email Notifications
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Receive updates in your inbox
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleAllEmail(!Object.values(settings.email).every(Boolean))}
              className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              {Object.values(settings.email).every(Boolean) ? 'Disable all' : 'Enable all'}
            </button>
          </div>

          <div className="space-y-3 pl-13">
            <Switch
              checked={settings.email.tripUpdates}
              onChange={(checked) => updateEmailSetting('tripUpdates', checked)}
              label="Trip updates"
              description="Changes to trips you're part of"
            />
            <Switch
              checked={settings.email.newFollowers}
              onChange={(checked) => updateEmailSetting('newFollowers', checked)}
              label="New followers"
              description="When someone follows you"
            />
            <Switch
              checked={settings.email.messages}
              onChange={(checked) => updateEmailSetting('messages', checked)}
              label="Messages"
              description="New messages from other users"
            />
            <Switch
              checked={settings.email.marketing}
              onChange={(checked) => updateEmailSetting('marketing', checked)}
              label="Marketing emails"
              description="Tips, deals, and product updates"
            />
            <Switch
              checked={settings.email.weeklyDigest}
              onChange={(checked) => updateEmailSetting('weeklyDigest', checked)}
              label="Weekly digest"
              description="Summary of activity on your trips"
            />
          </div>
        </div>

        {/* Push Notifications */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <span className="text-xl">🔔</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Push Notifications
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Instant alerts on your device
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleAllPush(!Object.values(settings.push).every(Boolean))}
              className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              {Object.values(settings.push).every(Boolean) ? 'Disable all' : 'Enable all'}
            </button>
          </div>

          <div className="space-y-3 pl-13">
            <Switch
              checked={settings.push.tripUpdates}
              onChange={(checked) => updatePushSetting('tripUpdates', checked)}
              label="Trip updates"
              description="Real-time changes to your trips"
            />
            <Switch
              checked={settings.push.newFollowers}
              onChange={(checked) => updatePushSetting('newFollowers', checked)}
              label="New followers"
              description="Instant notification when followed"
            />
            <Switch
              checked={settings.push.messages}
              onChange={(checked) => updatePushSetting('messages', checked)}
              label="Messages"
              description="Real-time message notifications"
            />
            <Switch
              checked={settings.push.votingReminders}
              onChange={(checked) => updatePushSetting('votingReminders', checked)}
              label="Voting reminders"
              description="Reminders for active votes"
            />
            <Switch
              checked={settings.push.tripReminders}
              onChange={(checked) => updatePushSetting('tripReminders', checked)}
              label="Trip reminders"
              description="Upcoming trip notifications"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          {hasChanges && (
            <span className="text-sm text-amber-600 dark:text-amber-400">
              You have unsaved changes
            </span>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
            className={`px-6 py-2.5 font-semibold rounded-xl transition-all ${
              hasChanges && !isLoading
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

export default NotificationSettings;
