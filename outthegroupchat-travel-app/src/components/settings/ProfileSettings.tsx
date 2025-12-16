'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/Switch';

interface ProfileSettingsProps {
  user: {
    name: string;
    email: string;
    bio?: string;
    city?: string;
    image?: string;
  };
  onSave: (data: Partial<ProfileSettingsProps['user']>) => Promise<void>;
}

export function ProfileSettings({ user, onSave }: ProfileSettingsProps) {
  const [formData, setFormData] = useState({
    name: user.name || '',
    bio: user.bio || '',
    city: user.city || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave(formData);
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
          Profile Information
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Update your personal details
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
            {user.image ? (
              <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              user.name?.charAt(0) || '?'
            )}
          </div>
          <div>
            <button
              type="button"
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Change photo
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              JPG, PNG, GIF. Max size 2MB.
            </p>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            placeholder="Your name"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 cursor-not-allowed"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Email cannot be changed
          </p>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Bio
          </label>
          <textarea
            value={formData.bio}
            onChange={(e) => handleChange('bio', e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
            placeholder="Tell others about yourself..."
            maxLength={160}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">
            {formData.bio.length}/160
          </p>
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Home City
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            placeholder="Your home city"
          />
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
            type="submit"
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
      </form>
    </div>
  );
}

export default ProfileSettings;
