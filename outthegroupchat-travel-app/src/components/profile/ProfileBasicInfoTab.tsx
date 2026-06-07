'use client';

interface ProfileBasicInfo {
  name: string;
  email: string;
  city?: string;
  bio?: string;
  preferences?: {
    travelStyle?: string;
    interests?: string[];
  };
}

interface ProfileBasicInfoTabProps {
  profile: ProfileBasicInfo;
  travelStyles: ReadonlyArray<{ value: string; label: string; emoji: string }>;
  interestOptions: ReadonlyArray<string>;
  onNameChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onTravelStyleChange: (value: string) => void;
  onToggleInterest: (interest: string) => void;
}

export function ProfileBasicInfoTab({
  profile,
  travelStyles,
  interestOptions,
  onNameChange,
  onCityChange,
  onBioChange,
  onTravelStyleChange,
  onToggleInterest,
}: ProfileBasicInfoTabProps) {
  return (
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
            onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onCityChange(e.target.value)}
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
            onChange={(e) => onTravelStyleChange(e.target.value)}
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
          onChange={(e) => onBioChange(e.target.value)}
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
              onClick={() => onToggleInterest(interest)}
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
  );
}
