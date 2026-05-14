'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { ProfileStatsTab } from '@/components/profile';
import { ProfileHeaderSection } from '@/components/profile/ProfileHeaderSection';
import { ProfileStatsCards } from '@/components/profile/ProfileStatsCards';
import { ProfileBasicInfoTab } from '@/components/profile/ProfileBasicInfoTab';
import { ProfilePreferencesTab } from '@/components/profile/ProfilePreferencesTab';
import { ProfileRecentCheckins } from '@/components/profile/ProfileRecentCheckins';
import type { CheckInResponse } from '@/types/checkin';

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
  const { status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'stats'>('profile');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInResponse[]>([]);
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
      fetchCheckIns();
    }
  }, [status, router]);

  const fetchCheckIns = async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(`/api/checkins?limit=5&since=${sevenDaysAgo}`);
      if (!response.ok) return;
      const data = await response.json() as { success: boolean; data?: { checkIns: CheckInResponse[] } };
      if (data.success && data.data?.checkIns) {
        setCheckIns(data.data.checkIns.slice(0, 5));
      }
    } catch {
      // Non-fatal — check-ins section simply stays empty
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      const data = await response.json();
      setProfile(data);
    } catch {
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
    } catch {
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
          <ProfileHeaderSection
            name={profile.name}
            image={profile.image}
            city={profile.city}
            bio={profile.bio}
            followers={profile.stats?.followers || 0}
            following={profile.stats?.following || 0}
          />

          <ProfileStatsCards
            tripsCreated={profile.stats?.tripsCreated || 0}
            tripsCompleted={profile.stats?.tripsCompleted || 0}
            countriesVisited={profile.stats?.countriesVisited || 0}
            activitiesPlanned={profile.stats?.activitiesPlanned || 0}
          />

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
                <ProfileBasicInfoTab
                  profile={profile}
                  travelStyles={travelStyles}
                  interestOptions={interestOptions}
                  onNameChange={(value) => setProfile({ ...profile, name: value })}
                  onCityChange={(value) => setProfile({ ...profile, city: value })}
                  onBioChange={(value) => setProfile({ ...profile, bio: value })}
                  onTravelStyleChange={(value) => setProfile({
                    ...profile,
                    preferences: { ...profile.preferences!, travelStyle: value },
                  })}
                  onToggleInterest={toggleInterest}
                />
              )}

              {activeTab === 'preferences' && (
                <ProfilePreferencesTab
                  currency={profile.preferences?.currency || 'USD'}
                  language={profile.preferences?.language || 'en'}
                  timezone={profile.preferences?.timezone || 'UTC'}
                  onCurrencyChange={(value) => setProfile({
                    ...profile,
                    preferences: { ...profile.preferences!, currency: value },
                  })}
                  onLanguageChange={(value) => setProfile({
                    ...profile,
                    preferences: { ...profile.preferences!, language: value },
                  })}
                  onTimezoneChange={(value) => setProfile({
                    ...profile,
                    preferences: { ...profile.preferences!, timezone: value },
                  })}
                />
              )}

              {activeTab === 'stats' && <ProfileStatsTab />}

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

          <ProfileRecentCheckins checkIns={checkIns} />
        </div>
      </main>
    </div>
  );
}
