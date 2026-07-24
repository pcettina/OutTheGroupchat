'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileSettings } from '@/components/settings';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export interface ProfileSettingsUser {
  name: string;
  email: string;
  bio?: string;
  city?: string;
  image?: string;
}

interface ProfileSettingsFormProps {
  user: ProfileSettingsUser;
}

/**
 * Client shell for the shared `ProfileSettings` panel.
 *
 * `ProfileSettings` takes an `onSave` callback, so it cannot be rendered
 * directly from the server page — this wrapper owns the write to
 * `PUT /api/profile` and refreshes server data after avatar changes so the
 * rest of the app (nav avatar, profile page) picks the new image up.
 */
export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(data: Partial<ProfileSettingsUser>): Promise<void> {
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          payload.error ??
            'Could not save your profile. Change a field and try saving again.'
        );
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError('Network error — please check your connection and try again.');
    }
  }

  function handleAvatarChange(): void {
    // Re-run the server component so the new avatar is reflected everywhere.
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {saved && (
        <p
          role="status"
          className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2"
        >
          Profile saved.
        </p>
      )}

      <ProfileSettings
        user={user}
        onSave={handleSave}
        onAvatarChange={handleAvatarChange}
      />
    </div>
  );
}
