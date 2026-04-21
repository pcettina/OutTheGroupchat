'use client';

import { useState } from 'react';

type Visibility = 'PUBLIC' | 'CREW' | 'PRIVATE';

const OPTIONS: { value: Visibility; label: string; description: string }[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone on OutTheGroupchat can see your check-ins.',
  },
  {
    value: 'CREW',
    label: 'Crew Only',
    description: 'Only your accepted Crew members can see where you are.',
  },
  {
    value: 'PRIVATE',
    label: 'Just Me',
    description: 'Your check-ins are only visible to you.',
  },
];

interface PrivacySettingsFormProps {
  initialVisibility: Visibility;
}

export function PrivacySettingsForm({ initialVisibility }: PrivacySettingsFormProps) {
  const [selected, setSelected] = useState<Visibility>(initialVisibility);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch('/api/users/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInVisibility: selected }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Failed to save settings');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              selected === option.value
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 hover:border-teal-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="checkInVisibility"
              value={option.value}
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <div className="font-semibold text-gray-900">{option.label}</div>
              <div className="text-sm text-gray-500">{option.description}</div>
            </div>
          </label>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Privacy Settings'}
      </button>
    </div>
  );
}
