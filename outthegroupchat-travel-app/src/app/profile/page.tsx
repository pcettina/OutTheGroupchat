'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string;
  city?: string;
  bio?: string;
  createdAt: string;
  preferences?: {
    currency: string;
    language: string;
    timezone: string;
    travelStyle?: string;
    interests?: string[];
  };
  stats?: {
    tripsCreated: number;
    tripsCompleted: number;
    countriesVisited: number;
    activitiesPlanned: number;
    followers: number;
    following: number;
  };
}

const travelStyles = [
  { value: 'adventure', label: 'Adventure Seeker', emoji: '🏔️' },
  { value: 'relaxation', label: 'Relaxation', emoji: '🏖️' },
  { value: 'cultural', label: 'Cultural Explorer', emoji: '🎭' },
  { value: 'family', label: 'Family Traveler', emoji: '👨‍👩‍👧‍👦' },
  { value: 'solo', label: 'Solo Explorer', emoji: '🎒' },
];

const interestOptions = [
  'Food & Dining', 'Nightlife', 'Nature', 'History', 'Art', 
  'Sports', 'Shopping', 'Photography', 'Music', 'Beach'
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'stats'>('profile');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    name: '',
    email: '',
    city: '',
    bio: '',
    createdAt: '',
    preferences: {
      currency: 'USD',
      language: 'en',
      timezone: 'UTC',
      travelStyle: '',
      interests: [],
    },
    stats: {
      tripsCreated: 0,
      tripsCompleted: 0,
      countriesVisited: 0,
      activitiesPlanned: 0,
      followers: 0,
      following: 0,
    },
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status, router]);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfile(data);
    } catch (error) {
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setProfile(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences!,
        interests: prev.preferences?.interests?.includes(interest)
          ? prev.preferences.interests.filter(i => i !== interest)
          : [...(prev.preferences?.interests || []), interest],
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen pt-16">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 animate-pulse mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4">
          {/* Profile Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-8"
          >
            {/* Cover Gradient */}
            <div className="h-48 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            {/* Profile Info Overlay */}
            <div className="relative -mt-20 px-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
                {/* Avatar */}
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-1 shadow-xl">
                  <div className="w-full h-full rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                    {profile.image ? (
                      <img
                        src={profile.image}
                        alt={profile.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl font-bold text-emerald-500">
                        {profile.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Name & Location */}
                <div className="flex-1 text-center sm:text-left pb-2">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {profile.name || 'Anonymous'}
                  </h1>
                  {profile.city && (
                    <p className="text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1 mt-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {profile.city}
                    </p>
                  )}
                  {profile.bio && (
                    <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-md">
                      {profile.bio}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-6 pb-2">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-500">{profile.stats?.followers || 0}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Followers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-500">{profile.stats?.following || 0}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Following</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
          >
            {[
              { label: 'Trips Created', value: profile.stats?.tripsCreated || 0, icon: '✈️' },
              { label: 'Completed', value: profile.stats?.tripsCompleted || 0, icon: '🎉' },
              { label: 'Countries', value: profile.stats?.countriesVisited || 0, icon: '🌍' },
              { label: 'Activities', value: profile.stats?.activitiesPlanned || 0, icon: '📍' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <span className="text-2xl">{stat.icon}</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {[
                { id: 'profile' as const, label: 'Profile', icon: '👤' },
                { id: 'preferences' as const, label: 'Preferences', icon: '⚙️' },
                { id: 'stats' as const, label: 'Travel Stats', icon: '📊' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Alerts */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
            >
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl"
            >
              <p className="text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {success}
              </p>
            </motion.div>
          )}

          {/* Tab Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <form onSubmit={handleSubmit}>
              {activeTab === 'profile' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>👤</span> Basic Information
                  </h2>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="input"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={profile.email}
                        disabled
                        className="input bg-slate-50 dark:bg-slate-700 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        City
                      </label>
                      <input
                        type="text"
                        value={profile.city || ''}
                        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                        placeholder="Where are you based?"
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Travel Style
                      </label>
                      <select
                        value={profile.preferences?.travelStyle || ''}
                        onChange={(e) => setProfile({
                          ...profile,
                          preferences: { ...profile.preferences!, travelStyle: e.target.value },
                        })}
                        className="input"
                      >
                        <option value="">Select your style</option>
                        {travelStyles.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.emoji} {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Bio
                    </label>
                    <textarea
                      value={profile.bio || ''}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      placeholder="Tell us about yourself and your travel experiences..."
                      rows={3}
                      className="input resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                      Travel Interests
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {interestOptions.map((interest) => (
                        <button
                          key={interest}
                          type="button"
                          onClick={() => toggleInterest(interest)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            profile.preferences?.interests?.includes(interest)
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {interest}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>⚙️</span> Preferences
                  </h2>

                  <div className="grid sm:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Currency
                      </label>
                      <select
                        value={profile.preferences?.currency || 'USD'}
                        onChange={(e) => setProfile({
                          ...profile,
                          preferences: { ...profile.preferences!, currency: e.target.value },
                        })}
                        className="input"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="JPY">JPY (¥)</option>
                        <option value="AUD">AUD (A$)</option>
                        <option value="CAD">CAD (C$)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Language
                      </label>
                      <select
                        value={profile.preferences?.language || 'en'}
                        onChange={(e) => setProfile({
                          ...profile,
                          preferences: { ...profile.preferences!, language: e.target.value },
                        })}
                        className="input"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="it">Italian</option>
                        <option value="pt">Portuguese</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Timezone
                      </label>
                      <select
                        value={profile.preferences?.timezone || 'UTC'}
                        onChange={(e) => setProfile({
                          ...profile,
                          preferences: { ...profile.preferences!, timezone: e.target.value },
                        })}
                        className="input"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Chicago">Central Time</option>
                        <option value="America/Denver">Mountain Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                        <option value="Europe/London">London</option>
                        <option value="Europe/Paris">Paris</option>
                        <option value="Asia/Tokyo">Tokyo</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'stats' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                    <span>📊</span> Your Travel Journey
                  </h2>

                  {/* Travel Timeline placeholder */}
                  <div className="text-center py-12">
                    <span className="text-6xl mb-4 block">🗺️</span>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                      Your travel history will appear here
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Complete trips to see your travel statistics, visited countries, and achievements.
                    </p>
                    <a
                      href="/trips/new"
                      className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-teal-700 transition-all"
                    >
                      Plan Your First Trip
                    </a>
                  </div>
                </div>
              )}

              {/* Save Button */}
              {activeTab !== 'stats' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex justify-end mt-6"
                >
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn btn-primary px-8"
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </span>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </motion.div>
              )}
            </form>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
