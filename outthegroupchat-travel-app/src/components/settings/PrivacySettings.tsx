'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/Switch';

interface PrivacySettingsData {
  profileVisibility: 'public' | 'friends' | 'private';
  showEmail: boolean;
  showCity: boolean;
  showTrips: boolean;
  allowFriendRequests: boolean;
  allowMessages: 'everyone' | 'friends' | 'none';
  showOnlineStatus: boolean;
  allowTagging: boolean;
}

interface PrivacySettingsProps {
  settings: PrivacySettingsData;
  onSave: (settings: PrivacySettingsData) => Promise<void>;
}

export function PrivacySettings({ settings: initialSettings, onSave }: PrivacySettingsProps) {
  const [settings, setSettings] = useState<PrivacySettingsData>(initialSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = <K extends keyof PrivacySettingsData>(
    key: K,
    value: PrivacySettingsData[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Privacy Settings
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Control who can see your information
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Profile Visibility */}
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
            Profile Visibility
          </h3>
          <div className="space-y-2">
            {(['public', 'friends', 'private'] as const).map((option) => (
              <button
                key={option}
                onClick={() => updateSetting('profileVisibility', option)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                  settings.profileVisibility === option
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white capitalize">
                    {option}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {option === 'public' && 'Anyone can view your profile'}
                    {option === 'friends' && 'Only people you follow can view your profile'}
                    {option === 'private' && 'Only you can view your profile'}
                  </p>
                </div>
                {settings.profileVisibility === option && (
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle Settings */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Switch
            checked={settings.showEmail}
            onChange={(checked) => updateSetting('showEmail', checked)}
            label="Show email on profile"
            description="Allow others to see your email address"
          />

          <Switch
            checked={settings.showCity}
            onChange={(checked) => updateSetting('showCity', checked)}
            label="Show location"
            description="Display your home city on your profile"
          />

          <Switch
            checked={settings.showTrips}
            onChange={(checked) => updateSetting('showTrips', checked)}
            label="Show trip history"
            description="Let others see your past trips"
          />

          <Switch
            checked={settings.allowFriendRequests}
            onChange={(checked) => updateSetting('allowFriendRequests', checked)}
            label="Allow follow requests"
            description="Let others send you follow requests"
          />

          <Switch
            checked={settings.showOnlineStatus}
            onChange={(checked) => updateSetting('showOnlineStatus', checked)}
            label="Show online status"
            description="Let others see when you're online"
          />

          <Switch
            checked={settings.allowTagging}
            onChange={(checked) => updateSetting('allowTagging', checked)}
            label="Allow tagging"
            description="Let others tag you in trips and posts"
          />
        </div>

        {/* Message Settings */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
            Who can message you?
          </h3>
          <div className="flex gap-2">
            {(['everyone', 'friends', 'none'] as const).map((option) => (
              <button
                key={option}
                onClick={() => updateSetting('allowMessages', option)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
                  settings.allowMessages === option
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {option === 'everyone' ? 'Everyone' : option === 'friends' ? 'Friends only' : 'No one'}
              </button>
            ))}
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

export default PrivacySettings;
