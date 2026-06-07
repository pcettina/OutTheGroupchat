# OTG Mobile — One-Shot Build Guide

**Compiled 2026-04-25.** Self-contained build guide for OutTheGroupchat iOS (Expo SDK 54). Intended to be handed to a coding agent or developer and executed end-to-end without external context. References `LAUNCH_RESEARCH_PORTFOLIO.md`, `iOS_IMPLEMENTATION_PLAN.md`, `PRODUCT_VISION.md`, and `V1_IMPLEMENTATION_PLAN.md` for upstream decisions; this doc captures everything needed to build.

---

## 0. Mission & locked decisions

**Mission:** ship `com.outthegroupchat.app` to the Apple App Store in 8-10 weeks. Hot-path target: app open → IRL commit in 30 seconds with Face ID + native haptics + APNs push + opt-in geolocation. Brand voice: "corner booth at a dimly-lit LES bar at 10:47 PM" — direct, warm, slightly dry, sentence case, no emoji, no exclamations. Success metric: IRL meetups completed, **not** time-in-app.

**Locked decisions (do not re-debate during build):**
- Architecture: **Expo SDK 54 + Expo Router** (rewrite UI in RN, reuse all server APIs). See `iOS_IMPLEMENTATION_PLAN.md §1-2`.
- Bundle ID: `com.outthegroupchat.app` (immutable post-first-submit).
- iOS minimum: **16.0** (~96% audience).
- Apple Developer holder: **sole proprietor with Organization enrollment** (founder confirmed 2026-04-25). Path = NY county DBA + DUNS + Apple Org enrollment so "OutTheGroupchat" displays as the developer on App Store. LLC conversion deferred — revisit pre-public-launch. See `iOS_IMPLEMENTATION_PLAN.md §13 Q1`.
- Selfie liveness vendor: **Persona** (abstract behind `src/lib/identity.ts`).
- Sign in with Apple, iPad, Lock Screen widget: **deferred to v1.5**.
- Android: sequential 4 weeks after iOS (same Expo codebase, W11-W12).
- PWA hedge: ship the existing Next.js web as PWA for closed-beta in parallel.
- Heatmaps (Interest / Presence / FoF): **deferred to v1.5** per `LAUNCH_RESEARCH_PORTFOLIO §4`.
- Trust stack required for App Store: Block + Report + EULA + age-gate + selfie liveness + safe-arrival + emergency contact + panic + account deletion. See `iOS_IMPLEMENTATION_PLAN.md §6`.

**Repo placement:** lite-monorepo within the existing `OutTheGroupchat` Git repo. New directory `outthegroupchat-mobile/` as a sibling to `outthegroupchat-travel-app/`. **No workspaces tooling** — each app has its own `package.json` and `node_modules`. Atomic commits across web + mobile when API contracts change. Web side (`outthegroupchat-travel-app/`) gets 5 server-prep changes (§15).

Resulting structure:
```
OutTheGroupchat/                    (existing Git repo)
├── .git/
├── outthegroupchat-travel-app/     (Next.js — existing)
├── outthegroupchat-mobile/         (Expo — NEW, sibling)
├── CLAUDE.md
└── ...
```

Existing nightly build (`nightly-otgc-build`) already path-filters to `outthegroupchat-travel-app/` — adding a sibling is invisible to it. If shared code grows past ~20 mirrored schemas or true design-system parity becomes a v1.5 goal, migrate to full Turborepo + pnpm workspaces then; do not pre-pay that complexity for v1.

---

## 1. Prerequisites

Before Phase A starts, the following must exist:

| Item | Owner | Status check |
|---|---|---|
| NY county DBA filing for "OutTheGroupchat" (~$50-100, ~1-2 days) | founder | DBA receipt |
| DUNS number lookup via D&B (free, ~3 days) | founder | DUNS number on file with Apple |
| Apple Developer Program Organization enrollment ($99/yr, ~1-7 days approval) | founder | Team ID visible in App Store Connect; developer name = "OutTheGroupchat" |
| Persona account (request demo at withpersona.com) | founder | API key + Inquiry template ID |
| Resend domain verified + `EMAIL_FROM` flipped (already flagged in `LAUNCH_RESEARCH_PORTFOLIO §8`) | founder | DNS SPF/DKIM/DMARC pass |
| Sentry project: separate "outthegroupchat-mobile" project | founder | DSN obtained |
| Expo account (free) | founder | EAS CLI logged in |
| Production domain DNS pointed at Vercel | founder | https serves prod build |
| `trust@outthegroupchat.com` inbox + on-call rotation | founder | Email forwards to founder + contractor |
| GitHub repo `outthegroupchat/mobile` created | founder | Empty private repo |

**Required environment variables (set in EAS Secrets and `.env.local`):**

```
EXPO_PUBLIC_API_BASE_URL=https://outthegroupchat.com
EXPO_PUBLIC_PUSHER_KEY=<from Vercel>
EXPO_PUBLIC_PUSHER_CLUSTER=us3
EXPO_PUBLIC_PERSONA_TEMPLATE_ID=itmpl_...
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
EXPO_PUBLIC_GOOGLE_PLACES_KEY=<from Vercel>
PERSONA_API_KEY=persona_production_...   # server-side only
APPLE_TEAM_ID=ABCD1234EF
APPLE_BUNDLE_ID=com.outthegroupchat.app
ASC_APP_ID=<App Store Connect app id>
EXPO_APPLE_ID=<founder Apple ID>
EXPO_APPLE_APP_SPECIFIC_PASSWORD=<from appleid.apple.com>
```

---

## 2. Repo scaffold

From the existing `OutTheGroupchat` Git repo root (which already contains `outthegroupchat-travel-app/`):

```bash
# at OutTheGroupchat repo root (parent of outthegroupchat-travel-app)
cd ~/Desktop/Businesses/OutTheGroupchat/OutTheGroupchat
pnpm create expo-app outthegroupchat-mobile --template tabs@54
# inherits the existing Git repo — do NOT run `git init`
cd outthegroupchat-mobile
# remove the auto-created README from the Expo template if it conflicts
```

Verify with `git status` from the repo root — `outthegroupchat-mobile/` should appear as untracked. Stage and commit the scaffold:

```bash
cd ~/Desktop/Businesses/OutTheGroupchat/OutTheGroupchat
git add outthegroupchat-mobile/
git commit -m "scaffold: outthegroupchat-mobile (Expo SDK 54)"
git push origin main   # or open PR per existing nightly-build conventions
```

Then install all required dependencies in one shot (§3).

---

## 3. Dependencies (`package.json`)

```json
{
  "name": "outthegroupchat-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start --dev-client",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "test": "jest",
    "lint": "eslint .",
    "tsc": "tsc --noEmit",
    "build:ios": "eas build --platform ios --profile production",
    "build:preview": "eas build --platform ios --profile preview",
    "submit:ios": "eas submit --platform ios"
  },
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~5.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-splash-screen": "~0.29.0",
    "expo-font": "~13.0.0",
    "expo-local-authentication": "~15.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-haptics": "~14.0.0",
    "expo-location": "~18.0.0",
    "expo-notifications": "~0.29.0",
    "expo-device": "~7.0.0",
    "expo-constants": "~17.0.0",
    "expo-task-manager": "~12.0.0",
    "expo-linking": "~7.0.0",
    "expo-clipboard": "~7.0.0",
    "expo-share": "~13.0.0",
    "expo-web-browser": "~14.0.0",
    "expo-image": "~2.0.0",
    "expo-blur": "~14.0.0",
    "expo-modules-core": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-safe-area-context": "~4.14.0",
    "react-native-screens": "~4.4.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-svg": "~15.8.0",
    "@tanstack/react-query": "^5.59.0",
    "zustand": "^5.0.0",
    "react-hook-form": "^7.53.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.9.0",
    "pusher-js": "^8.4.0-rc2",
    "@sentry/react-native": "~7.0.0",
    "@withpersona/react-native-inquiry-sdk": "^2.0.0",
    "react-native-mmkv": "^3.0.0",
    "lucide-react-native": "^0.460.0",
    "date-fns": "^4.1.0",
    "react-native-modal": "^14.0.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "~5.6.0",
    "jest": "~29.7.0",
    "jest-expo": "~54.0.0",
    "@testing-library/react-native": "^13.0.0",
    "eslint": "^9.0.0",
    "eslint-config-expo": "~9.0.0",
    "prettier": "^3.4.0"
  },
  "private": true
}
```

**Why these deps (each one earns its place):**
- `expo-router` — file-based routing (Next.js App Router parity)
- `expo-local-authentication` — Face ID / Touch ID via Secure Enclave
- `expo-secure-store` — encrypted keychain for refresh tokens
- `expo-haptics` — native haptic feedback on commit
- `expo-location` + `expo-task-manager` — foreground + background geofence (safe-arrival)
- `expo-notifications` — APNs push registration + handler
- `@tanstack/react-query` — server state, caching, optimistic UI
- `zustand` — local state (current Intent draft, hot-path session)
- `react-hook-form` + `zod` — same form/validation pattern as web
- `pusher-js` — real-time SubCrew formation events (matches web)
- `@sentry/react-native` — observability
- `@withpersona/react-native-inquiry-sdk` — selfie liveness verification
- `react-native-mmkv` — fast key-value storage (preferences, cache)
- `lucide-react-native` — same icon library as web

---

## 4. Configuration files

### 4.1 `app.json`

```json
{
  "expo": {
    "name": "OutTheGroupchat",
    "slug": "outthegroupchat-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "outthegroupchat",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "cover",
      "backgroundColor": "#15110E"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.outthegroupchat.app",
      "buildNumber": "1",
      "deploymentTarget": "16.0",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSCameraUsageDescription": "OutTheGroupchat uses your camera for one-time selfie verification to keep meetups safe.",
        "NSLocationWhenInUseUsageDescription": "Share your neighborhood to match with Crew nearby. Exact location is never shared without your opt-in.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Used only when you enable safe-arrival check-ins for an active meetup.",
        "NSContactsUsageDescription": "Find friends already on OutTheGroupchat. Contacts are matched on-device, never uploaded.",
        "NSFaceIDUsageDescription": "Use Face ID to keep your sessions short and secure.",
        "UIBackgroundModes": ["location", "remote-notification"]
      },
      "associatedDomains": ["applinks:outthegroupchat.com"],
      "config": {
        "usesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "com.outthegroupchat.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#15110E"
      }
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Used only when you enable safe-arrival check-ins for an active meetup.",
          "isIosBackgroundLocationEnabled": true,
          "isAndroidBackgroundLocationEnabled": true
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#FF6B4A"
        }
      ],
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "16.0",
            "useFrameworks": "static"
          }
        }
      ],
      "@sentry/react-native/expo"
    ],
    "extra": {
      "eas": { "projectId": "TO_BE_FILLED_BY_EAS" }
    },
    "owner": "outthegroupchat"
  }
}
```

### 4.2 `eas.json`

```json
{
  "cli": { "version": ">= 13.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "resourceClass": "m-medium" }
    },
    "production": {
      "autoIncrement": true,
      "ios": { "resourceClass": "m-medium" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "$EXPO_APPLE_ID",
        "ascAppId": "$ASC_APP_ID",
        "appleTeamId": "$APPLE_TEAM_ID"
      }
    }
  }
}
```

### 4.3 `tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

### 4.4 `babel.config.js`

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin']
  };
};
```

---

## 5. File structure

```
outthegroupchat-mobile/
├── app/                           # Expo Router (file-based)
│   ├── _layout.tsx                # Root: SafeAreaProvider, QueryProvider, AuthProvider, Sentry
│   ├── index.tsx                  # Splash redirect → /auth or /(tabs)/tonight
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── phone.tsx              # Phone number entry
│   │   ├── otp.tsx                # OTP verification
│   │   ├── dob.tsx                # 18+ age gate (REQUIRED)
│   │   ├── eula.tsx               # EULA acceptance (REQUIRED)
│   │   └── profile-setup.tsx      # Name, photo, 3 topics
│   ├── (tabs)/
│   │   ├── _layout.tsx            # Tab bar (Tonight / Crew / Profile)
│   │   ├── tonight.tsx            # HOT-PATH HOME — preset chip stack
│   │   ├── crew.tsx               # Crew list + accept/decline
│   │   └── profile.tsx            # Self-profile, settings, account-delete
│   ├── intent/
│   │   ├── new.tsx                # Single-screen intent capture
│   │   └── [id].tsx               # Active intent detail
│   ├── subcrew/
│   │   └── [id].tsx               # SubCrew detail + venue picker + I'm In
│   ├── meetup/
│   │   └── [id].tsx               # Active meetup screen + panic button
│   ├── user/
│   │   └── [id].tsx               # Other user profile (Block + Report here)
│   ├── verify-identity.tsx        # Persona selfie-liveness flow
│   ├── safe-arrival.tsx           # Safe-arrival check-in screen
│   └── modals/
│       ├── report.tsx             # Report flow (4-cat picker + free-text)
│       ├── block.tsx              # Block confirmation
│       └── emergency-contact.tsx  # Emergency contact picker
├── src/
│   ├── api/
│   │   ├── client.ts              # Fetch wrapper + auth + retry
│   │   ├── intents.ts             # POST/GET /api/intents
│   │   ├── subcrews.ts
│   │   ├── meetups.ts
│   │   ├── crew.ts
│   │   ├── checkins.ts
│   │   ├── users.ts
│   │   ├── reports.ts
│   │   ├── blocks.ts
│   │   └── push.ts
│   ├── auth/
│   │   ├── store.ts               # Zustand: token state
│   │   ├── biometric.ts           # Face ID resume
│   │   └── tokens.ts              # SecureStore wrappers
│   ├── design/
│   │   ├── colors.ts              # Last Call palette
│   │   ├── typography.ts          # Cabinet Grotesk + Switzer
│   │   ├── spacing.ts
│   │   └── theme.ts               # Combined theme object
│   ├── components/
│   │   ├── ui/                    # Button, Card, Sheet, Toast, Avatar, etc.
│   │   ├── intent/                # PresetChip, IntentCard, TimeSlider
│   │   ├── crew/                  # CrewMemberRow, CrewBadge
│   │   ├── meetup/                # MeetupCard, RSVPButton
│   │   └── safety/                # ReportButton, BlockButton, PanicButton
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useLocation.ts         # Opt-in foreground geolocation
│   │   ├── useSafeArrival.ts      # Background geofence
│   │   ├── usePushSetup.ts        # APNs registration
│   │   ├── usePusher.ts           # Real-time SubCrew alerts
│   │   ├── useHaptic.ts
│   │   └── useReducedMotion.ts
│   ├── lib/
│   │   ├── analytics.ts           # Sentry wrapper
│   │   ├── identity.ts            # Persona liveness wrapper (vendor-abstracted)
│   │   ├── validators.ts          # Zod schemas (mirror server-side)
│   │   ├── format.ts              # Time/distance formatters
│   │   └── constants.ts
│   ├── store/
│   │   ├── intent.ts              # Zustand: current Intent draft
│   │   ├── session.ts             # Zustand: hot-path session state
│   │   └── prefs.ts               # MMKV: notification prefs
│   └── types/
│       ├── api.ts                 # Mirror server types from outthegroupchat-travel-app/src/types/
│       └── index.ts
├── ios/                           # Native iOS — generated by expo prebuild + Live Activities Swift module
│   └── OTGLiveActivity/           # Swift WidgetKit + ActivityKit module
├── assets/
│   ├── icon.png                   # 1024×1024
│   ├── splash.png
│   ├── adaptive-icon.png          # Android
│   ├── notification-icon.png
│   └── fonts/
│       ├── CabinetGrotesk-Bold.otf
│       ├── CabinetGrotesk-Semibold.otf
│       ├── CabinetGrotesk-Medium.otf
│       ├── Switzer-Regular.otf
│       ├── Switzer-Medium.otf
│       └── Switzer-Semibold.otf
├── PrivacyInfo.xcprivacy          # See §16
├── app.json
├── eas.json
├── tsconfig.json
├── babel.config.js
├── package.json
└── README.md
```

---

## 6. Design system (`src/design/`)

### `src/design/colors.ts`

```ts
// Last Call palette — locked.
export const colors = {
  sodium: '#FF6B4A',         // primary action
  bourbon: '#FFB347',        // secondary
  brick: '#7A2C1A',          // pressed
  tile: '#5FB3A8',           // Crew accent
  maraschino: '#3A1F2B',     // live-now
  bgDark: '#15110E',         // app background
  bgLight: '#FAF3E7',        // paper (rare; mostly dark-first)
  textBright: '#F5EBDD',
  textDim: '#8B7E6F',
  border: '#2B221C',
  danger: '#D04A3C',
} as const;

export type ColorToken = keyof typeof colors;
```

### `src/design/typography.ts`

```ts
import * as Font from 'expo-font';

export const fonts = {
  display: 'CabinetGrotesk-Bold',
  displaySemibold: 'CabinetGrotesk-Semibold',
  displayMedium: 'CabinetGrotesk-Medium',
  body: 'Switzer-Regular',
  bodyMedium: 'Switzer-Medium',
  bodySemibold: 'Switzer-Semibold',
} as const;

export const text = {
  // Brand voice rules — sentence case, no exclamations, no emoji
  display:    { fontFamily: fonts.display,    fontSize: 32, lineHeight: 38 },
  h1:         { fontFamily: fonts.displaySemibold, fontSize: 24, lineHeight: 30 },
  h2:         { fontFamily: fonts.displayMedium,   fontSize: 20, lineHeight: 26 },
  body:       { fontFamily: fonts.body,       fontSize: 16, lineHeight: 22 },
  bodySm:     { fontFamily: fonts.body,       fontSize: 14, lineHeight: 20 },
  label:      { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption:    { fontFamily: fonts.body,       fontSize: 12, lineHeight: 16 },
} as const;

export async function loadFonts() {
  await Font.loadAsync({
    'CabinetGrotesk-Bold':       require('../../assets/fonts/CabinetGrotesk-Bold.otf'),
    'CabinetGrotesk-Semibold':   require('../../assets/fonts/CabinetGrotesk-Semibold.otf'),
    'CabinetGrotesk-Medium':     require('../../assets/fonts/CabinetGrotesk-Medium.otf'),
    'Switzer-Regular':           require('../../assets/fonts/Switzer-Regular.otf'),
    'Switzer-Medium':            require('../../assets/fonts/Switzer-Medium.otf'),
    'Switzer-Semibold':          require('../../assets/fonts/Switzer-Semibold.otf'),
  });
}
```

### `src/design/spacing.ts`

```ts
export const space = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const;

export const radius = {
  sm: 6, md: 10, lg: 16, xl: 24, full: 9999,
} as const;
```

---

## 7. App shell (`app/_layout.tsx`)

```tsx
import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { loadFonts } from '@/design/typography';
import { colors } from '@/design/colors';
import { AuthProvider } from '@/auth/store';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.1,                  // production sample rate (matches server)
});

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function RootLayout() {
  useEffect(() => {
    loadFonts().finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" backgroundColor={colors.bgDark} />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.bgDark },
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
```

---

## 8. API client (`src/api/client.ts`)

```ts
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

const BASE = process.env.EXPO_PUBLIC_API_BASE_URL!;

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token');
}
async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync('refresh_token');
}
async function setTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync('access_token', access);
  await SecureStore.setItemAsync('refresh_token', refresh);
}
async function clearTokens() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
}

async function refresh(): Promise<string | null> {
  const r = await getRefreshToken();
  if (!r) return null;
  const res = await fetch(`${BASE}/api/auth/mobile/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: r }),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const { access_token, refresh_token } = await res.json();
  await setTokens(access_token, refresh_token);
  return access_token;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && !retried) {
    const fresh = await refresh();
    if (fresh) return api<T>(path, init, true);
    throw new Error('UNAUTHENTICATED');
  }

  if (!res.ok) {
    const err = await res.text();
    Sentry.captureMessage(`API ${res.status} ${path}: ${err}`);
    throw new Error(err || `${res.status}`);
  }

  return res.json();
}

export { setTokens, clearTokens };
```

Per-resource modules (`intents.ts`, `subcrews.ts`, etc.) wrap `api()` and provide typed Zod-validated responses. Mirror the server-side Zod schemas from `outthegroupchat-travel-app/src/lib/validators/`.

---

## 9. Auth flow

### 9.1 Phone OTP flow

`app/(auth)/phone.tsx` collects phone number → POST `/api/auth/mobile/phone-start`. Server sends SMS via Twilio. `app/(auth)/otp.tsx` collects 6-digit OTP → POST `/api/auth/mobile/phone-verify` → returns `{ access_token, refresh_token, user }`. Tokens persist in SecureStore. On success: if user is new → `/(auth)/dob`, else → `/(tabs)/tonight`.

### 9.2 Age gate (`app/(auth)/dob.tsx`)

DOB picker (year + month + day). Hard 18+ block. POST `/api/users/me` with `dateOfBirth`. If <18 → silent block, log `Sentry.captureMessage('underage_signup_blocked')`, sign user out, navigate to a generic "we'll see you when you're 18" screen.

### 9.3 EULA acceptance (`app/(auth)/eula.tsx`)

Display full EULA text (loaded from server, with version stamp). Single "I agree" button. POST `/api/users/me/accept-eula` with `{ eulaVersion: "1.0" }`. Persists `eulaAcceptedAt` and `eulaVersion` on User. Re-prompt on EULA version bump.

### 9.4 Biometric resume (`src/auth/biometric.ts`)

```ts
import * as LocalAuthentication from 'expo-local-authentication';

export async function biometricResumeAvailable(): Promise<boolean> {
  const has = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return has && enrolled;
}

export async function biometricUnlock(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Resume your session',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  });
  return result.success;
}
```

On every cold start: if access token exists in SecureStore + last-active >24h ago → trigger `biometricUnlock()` before exposing app content. If <24h ago → resume silently. This is the "0 keyboard inputs" hot-path requirement.

---

## 10. Hot-path screens

### 10.1 `app/(tabs)/tonight.tsx` — the home screen

```tsx
import { View, Pressable, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, text, space, radius } from '@/design';
import { useSmartDefaults } from '@/hooks/useSmartDefaults';
import { fetchPresetSuggestions } from '@/api/intents';

export default function Tonight() {
  const router = useRouter();
  const defaults = useSmartDefaults();   // time × day × neighborhood × last-3-intents
  const { data: presets } = useQuery({
    queryKey: ['preset-suggestions', defaults.dayKey, defaults.neighborhood],
    queryFn: () => fetchPresetSuggestions(defaults),
    staleTime: 60_000,
  });

  const onChip = async (preset: typeof presets[number]) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/intent/new', params: { preset: preset.id } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.xxl }}>
      <Text style={[text.display, { color: colors.textBright }]}>tonight</Text>
      <Text style={[text.body, { color: colors.textDim, marginBottom: space.lg }]}>
        {presets && presets[0]
          ? `${presets[0].alignedCount} of your crew are looking too`
          : `nobody's signaled yet — be first`}
      </Text>

      {(presets ?? []).map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onChip(p)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.brick : colors.sodium,
            padding: space.lg,
            borderRadius: radius.lg,
            marginBottom: space.md,
          })}
        >
          <Text style={[text.h1, { color: colors.bgDark }]}>{p.label}</Text>
          <Text style={[text.bodySm, { color: colors.bgDark, opacity: 0.75 }]}>
            {p.subtitle}
          </Text>
        </Pressable>
      ))}

      {/* Sticky button at thumb-zone */}
      <Pressable
        onPress={() => router.push('/intent/new')}
        style={{
          position: 'absolute', bottom: space.xl, left: space.lg, right: space.lg,
          padding: space.lg, borderRadius: radius.full,
          borderWidth: 2, borderColor: colors.sodium,
        }}
      >
        <Text style={[text.h2, { color: colors.sodium, textAlign: 'center' }]}>
          something else
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

### 10.2 `app/intent/new.tsx` — intent capture

Single screen. Pre-filled time slider (±2h around smart default), neighborhood (auto-detected via `useLocation` if granted; manual fallback), identity-mode picker (Public / Crew / Private — defaults to Crew). Submit button: "I'm Out". On press: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`, optimistic insert via React Query, navigate to `/(tabs)/tonight` with toast banner. If server rejects after optimistic show: silent rollback + Sentry breadcrumb.

### 10.3 `app/subcrew/[id].tsx` — SubCrew detail

Renders when group-formation push fires. Shows: 3 venue chip suggestions (from `/api/recommendations`), member avatars, "I'm In" button. On commit: `Haptics.notificationAsync('success')` → POST `/api/subcrews/[id]/join` → screen dims and closes app via `App.terminate()` equivalent (actually just navigate to a confirm screen that auto-backgrounds at 6s via `setTimeout(() => Linking.openURL('app://background'))` — Expo doesn't have direct app-backgrounding; use a "see you at 9. phone goes back in pocket" full-screen until user manually backgrounds).

### 10.4 `app/(tabs)/crew.tsx` — Crew list

List of accepted Crew + pending Crew requests. Long-press row → action sheet with Block + Report.

### 10.5 `app/user/[id].tsx` — Other-user profile

Always shows ⋯ button top-right opening sheet: Crew action (Add / Remove / Block) + Report. Apple Review needs both visible from any UGC surface.

---

## 11. Trust & safety surfaces

### 11.1 Block flow

`app/modals/block.tsx`:
- Presented as a half-sheet
- "Block @{handle}? They will no longer see your activity, share Crew, or be able to RSVP to your meetups."
- Confirm button → POST `/api/blocks { blockedUserId }`
- On success: navigate back, toast "Blocked.", refresh Crew + feed queries

Server (web side) creates `UserBlock { blockerId, blockedId }` row, cascades through 2-hop visibility queries.

### 11.2 Report flow

`app/modals/report.tsx`:
- 4-category picker: harassment / safety threat / impersonation / spam
- Free-text field (≤500 chars)
- Submit → POST `/api/reports { targetUserId, targetContentId?, category, freeText }`
- Confirmation: "Reported. Our team responds within 24 hours."
- Server enqueues for `trust@` queue + email founder/contractor

### 11.3 Persona selfie liveness

`app/verify-identity.tsx` invokes `@withpersona/react-native-inquiry-sdk`:

```tsx
import Inquiry, { Environment } from '@withpersona/react-native-inquiry-sdk';
import { api } from '@/api/client';
import { useRouter } from 'expo-router';

export default function VerifyIdentity() {
  const router = useRouter();

  const start = () => {
    Inquiry.fromTemplate(process.env.EXPO_PUBLIC_PERSONA_TEMPLATE_ID!)
      .environment(Environment.PRODUCTION)
      .onComplete(async (inquiryId, status, _fields) => {
        await api('/api/users/me/identity-verified', {
          method: 'POST',
          body: JSON.stringify({ inquiryId, status }),
        });
        router.back();
      })
      .onCanceled(() => router.back())
      .onError((error) => {
        console.error('Persona error:', error);
        router.back();
      })
      .build()
      .start();
  };

  return (/* CTA UI */);
}
```

Server (web) verifies the inquiry via Persona's webhook + API check, sets `User.photoVerifiedAt`. Never trust client-only status.

### 11.4 Safe-arrival check-in

Background task registered via `expo-task-manager` when a meetup transitions to "active" state. 30 min after start: local notification "Made it safely?" with Yes / No / Need help inline-action buttons. "No" or no response in 60 min: POST `/api/safety/escalate` triggers SMS to emergency contact via Twilio (server-side).

```ts
// src/hooks/useSafeArrival.ts
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

export const SAFE_ARRIVAL_TASK = 'OTG_SAFE_ARRIVAL_CHECK';

TaskManager.defineTask(SAFE_ARRIVAL_TASK, async ({ data, error }) => {
  if (error) return;
  const { meetupId } = data as { meetupId: string };
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'made it safely?',
      body: 'tap yes if you arrived. tap no to alert your emergency contact.',
      categoryIdentifier: 'SAFE_ARRIVAL',
      data: { meetupId },
    },
    trigger: { seconds: 30 * 60 },
  });
});
```

Notification category `SAFE_ARRIVAL` registered with `Yes` and `No` actions; actions hit `/api/safety/respond` server endpoint.

### 11.5 Emergency contact + panic button

Persisted in `User.emergencyContactPhone` (encrypted at rest). `app/meetup/[id].tsx` shows panic button top-right when meetup is in "active" state:

```tsx
import { Linking } from 'react-native';
import * as Location from 'expo-location';

const onPanic = async () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  await api('/api/safety/panic', {
    method: 'POST',
    body: JSON.stringify({ meetupId, latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
  });
  Linking.openURL('tel:911');
};
```

Server endpoint sends SMS to emergency contact with location + 911 dispatch confirmation + Sentry alert.

### 11.6 Account deletion

`app/(tabs)/profile.tsx` → Settings → Delete Account → confirmation modal → DELETE `/api/users/me`. Server cascades through Prisma `onDelete: Cascade`, queues email confirmation, signs user out. Required by Apple Guideline 5.1.1(v).

---

## 12. Push notifications

### 12.1 Registration (`src/hooks/usePushSetup.ts`)

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/api/client';

export async function registerPush(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = process.env.EAS_PROJECT_ID;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/api/users/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: tokenData.data, platform: Platform.OS }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('group-formation', {
      name: 'Group formation',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
  return tokenData.data;
}
```

Call `registerPush()` after signup completes, never before (defer-permission rule from `LAUNCH_RESEARCH_PORTFOLIO §3 friction #3`).

### 12.2 Notification handler

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,        // OTG voice: no engagement sounds
    shouldSetBadge: false,         // No badge counts (anti-engagement rule #2)
  }),
});

Notifications.addNotificationResponseReceivedListener((response) => {
  const { type, subcrewId, meetupId } = response.notification.request.content.data ?? {};
  if (type === 'subcrew_formed') router.push(`/subcrew/${subcrewId}`);
  else if (type === 'safe_arrival') router.push(`/safe-arrival?meetupId=${meetupId}`);
  else if (type === 'daily_prompt') router.push('/(tabs)/tonight');
});
```

### 12.3 Categories per `LAUNCH_RESEARCH_PORTFOLIO §6`

Three notification types, each routed by `data.type`:
- `daily_prompt` (1/day, dinner-time) → Tonight screen
- `per_member_intent` (3/day cap) → Crew screen
- `subcrew_formed` (≤2/day, never bundled) → SubCrew detail screen

Honor `User.notificationPreferences` server-side; silently skip on opt-out.

---

## 13. Geolocation

### 13.1 Foreground (`src/hooks/useLocation.ts`)

```ts
import * as Location from 'expo-location';
import { useState, useCallback } from 'react';

export function useLocation() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  const request = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermission(status);
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    }
  }, []);

  return { coords, permission, request };
}
```

Request location only at the moment of intent capture, never on app open. Map raw lat/lng to `cityArea` (neighborhood polygon) server-side; raw coords never leave to other users (audit per `LAUNCH_RESEARCH_PORTFOLIO §8 step 10`).

### 13.2 Background geofence for safe-arrival

Only request `Location.requestBackgroundPermissionsAsync()` when user opts into safe-arrival. App Store reviewers scrutinize "Always" location requests — keep it lazy + justified in `Info.plist` description.

---

## 14. Live Activities (SubCrew countdown)

ActivityKit requires a Swift module bridged to RN. Generate with `expo prebuild` then add a Widget Extension target in Xcode.

### 14.1 Swift module skeleton (`ios/OTGLiveActivity/OTGSubCrewActivity.swift`)

```swift
import ActivityKit
import WidgetKit
import SwiftUI

struct SubCrewAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var checkedInCount: Int
        var totalCount: Int
        var venueName: String
        var minutesUntil: Int
    }
    var subcrewId: String
    var topicLabel: String
}

struct OTGSubCrewActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SubCrewAttributes.self) { context in
            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.topicLabel.lowercased())
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(red: 0.96, green: 0.92, blue: 0.86))
                Text("\(context.state.minutesUntil)m · \(context.state.venueName)")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Color(red: 1.0, green: 0.42, blue: 0.29))
                Text("\(context.state.checkedInCount) of \(context.state.totalCount) checked in")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.55, green: 0.49, blue: 0.44))
            }
            .padding()
            .activityBackgroundTint(Color(red: 0.082, green: 0.067, blue: 0.055))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    Text("\(context.state.minutesUntil)m to \(context.state.venueName)")
                        .foregroundColor(Color(red: 1.0, green: 0.42, blue: 0.29))
                }
            } compactLeading: {
                Text("OTG").font(.caption2)
            } compactTrailing: {
                Text("\(context.state.minutesUntil)m")
            } minimal: {
                Text("\(context.state.minutesUntil)")
            }
        }
    }
}
```

### 14.2 RN bridge (`src/lib/liveActivity.ts`)

```ts
import { NativeModules } from 'react-native';

interface OTGLiveActivityModule {
  startSubCrewActivity: (params: {
    subcrewId: string;
    topicLabel: string;
    checkedInCount: number;
    totalCount: number;
    venueName: string;
    minutesUntil: number;
  }) => Promise<string>;  // returns activity token
  updateSubCrewActivity: (token: string, state: { checkedInCount: number; minutesUntil: number }) => Promise<void>;
  endSubCrewActivity: (token: string) => Promise<void>;
}

const { OTGLiveActivity } = NativeModules as { OTGLiveActivity: OTGLiveActivityModule };

export const liveActivity = OTGLiveActivity;
```

Trigger `liveActivity.startSubCrewActivity()` when a SubCrew COMMITs. Update via APNs push payload using ActivityKit's push-token mechanism (server uses `apns-topic: <bundleId>.push-type.liveactivity`). End on meetup completion or dismissal.

---

## 15. Web-side server changes (in `outthegroupchat-travel-app/`)

These 5 changes must land before mobile Phase A finishes. Open as a single PR `mobile-server-prep`.

### 15.1 Bearer-token auth (`src/app/api/auth/mobile/`)

New endpoints:
- `POST /api/auth/mobile/phone-start` → SMS OTP via Twilio
- `POST /api/auth/mobile/phone-verify` → returns `{ access_token (15min), refresh_token (30d), user }`
- `POST /api/auth/mobile/refresh` → rotates refresh token

Use `jose` for JWT signing with `JWT_SECRET` env var. Add token-payload validation middleware for any route hit by Bearer auth. NextAuth cookies remain unchanged for web.

### 15.2 `PushSubscription` Prisma model

```prisma
model PushSubscription {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expoPushToken String   @unique
  platform      String   // "ios" | "android"
  enabled       Boolean  @default(true)
  lastSeenAt    DateTime @updatedAt
  createdAt     DateTime @default(now())
  @@index([userId])
}
```

Migration: `npx prisma migrate dev --name add_push_subscription`.

### 15.3 `POST /api/users/push-token`

Auth-required. Upserts `PushSubscription` by `expoPushToken`. Marks token as enabled.

### 15.4 `src/lib/push.ts` (Expo Push fan-out)

```ts
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
const expo = new Expo();

export async function sendPushToUsers(userIds: string[], payload: { title: string; body: string; data?: Record<string, unknown> }) {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, enabled: true },
  });
  const messages: ExpoPushMessage[] = subs
    .filter(s => Expo.isExpoPushToken(s.expoPushToken))
    .map(s => ({
      to: s.expoPushToken,
      sound: null,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      _displayInForeground: false,
    }));
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) await expo.sendPushNotificationsAsync(chunk);
}
```

Wire into existing notification dispatch points (group formation, daily-prompt cron, safe-arrival cron). Coexists with Pusher (in-app realtime) and Resend (email).

### 15.5 `DELETE /api/users/me` + missing safety models

```prisma
model UserBlock {
  id         String @id @default(cuid())
  blockerId  String
  blockedId  String
  createdAt  DateTime @default(now())
  @@unique([blockerId, blockedId])
  @@index([blockedId])
}

model Report {
  id             String @id @default(cuid())
  reporterId     String
  targetUserId   String?
  targetMeetupId String?
  targetIntentId String?
  category       String     // 'harassment' | 'safety' | 'impersonation' | 'spam'
  freeText       String?
  status         String     @default("open")  // 'open' | 'in_review' | 'actioned' | 'dismissed'
  modNote        String?
  createdAt      DateTime   @default(now())
  resolvedAt     DateTime?
  @@index([targetUserId, status])
  @@index([reporterId])
}
```

Add `User.dateOfBirth` (DateTime), `User.eulaAcceptedAt`, `User.eulaVersion`, `User.emergencyContactPhone` (encrypted via `@prisma/client` field-level extension), `User.photoVerifiedAt`, `User.trustTier` enum.

Migration: `npx prisma migrate dev --name add_safety_surfaces`.

---

## 16. App Store artifacts

### 16.1 `PrivacyInfo.xcprivacy`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypePhoneNumber</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypePhotos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeOtherUserContent</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeCrashData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAnalytics</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypePerformanceData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAnalytics</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

Verify each bundled SDK ships its own manifest: Sentry ✓, Persona (verify with vendor), Pusher (likely needs shim), expo-* packages ✓.

### 16.2 App Store Connect metadata (paste-ready)

| Field | Value |
|---|---|
| **Name** | OutTheGroupchat |
| **Subtitle** | the app that wants you off your phone |
| **Bundle ID** | com.outthegroupchat.app |
| **Primary category** | Social Networking |
| **Secondary category** | Lifestyle |
| **Age Rating** | 17+ (Frequent/Intense Mature/Suggestive Themes; Frequent/Intense Alcohol, Tobacco, or Drug Use References) |
| **Keywords** (≤100 chars) | meetup,nyc,crew,plans,group chat,friends,bar,run club,coffee,off your phone |
| **Promotional Text** (≤170) | the app that turns "we should hang out" into a corner booth at 9pm tonight |
| **Description** (≤4000) | OutTheGroupchat is a meetup app for adults 18+ in NYC. Signal what you want to do tonight — coffee, a drink, a walk, a show — and we group you with a Crew of two to six who said the same thing. Then you pick a venue and meet IN PERSON. \n\nNo feed. No likes. No follower counts. No streaks. \n\nThe app's only metric is real meetups completed. When you've committed, the app closes itself and tells you to put your phone away. \n\nFor your safety: every profile has Block and Report. Every meetup has a panic button. Selfie verification keeps catfish out. Safe-arrival check-ins notify your emergency contact if you don't make it. \n\nNYC only. 18+ only. Sentence case. No emoji. Just plans. |

### 16.3 Verbatim Review Notes

Use the verbatim Review Notes from `iOS_IMPLEMENTATION_PLAN.md §8`. Paste into App Store Connect → App Information → Review Information → Notes.

### 16.4 Screenshots required (6.7" — iPhone 16 Pro Max)

1. Tonight screen with 3 preset chips + "2 of your crew are looking too" headline
2. Intent capture sheet mid-commit with time slider
3. SubCrew formation push notification preview + SubCrew detail
4. Crew list with Block + Report long-press menu visible
5. Active meetup screen with panic button highlighted

Generate via Expo simulator `xcrun simctl io booted screenshot`. 1290×2796 px. No text overlays beyond what's in-app.

---

## 17. EAS build & submit

```bash
# one-time setup
eas login
eas project:init                            # writes projectId into app.json extra.eas
eas credentials                             # generate distribution cert + provisioning profile + APNs key

# preview build for TestFlight internal
eas build --platform ios --profile preview

# production build
eas build --platform ios --profile production

# submit to App Store Connect (TestFlight + Review queue)
eas submit --platform ios --latest

# subsequent builds (auto-increment buildNumber)
eas build --platform ios --profile production --auto-submit
```

**TestFlight workflow:**
1. EAS Build completes → upload to TestFlight automatically (if `--auto-submit`)
2. Internal testers (up to 100, no Beta App Review): founder + ops team, immediate
3. External beta (Beta App Review ~24h): 50 NYC seeds, transition cohort from PWA hedge
4. Once external testers validated, submit for App Store Review with `eas submit --latest`

---

## 18. Testing

### 18.1 Unit tests (`jest` + `@testing-library/react-native`)

- API client `src/api/client.ts`: token refresh on 401, error propagation
- Auth flows: phone OTP happy path + invalid OTP + expired refresh
- Block/Report mutations: optimistic UI + rollback
- Smart defaults hook: time × day × neighborhood expected output

### 18.2 E2E tests (Maestro)

Maestro flows for the 30-second hot path + every required-feature path:

```yaml
# .maestro/hot-path.yaml
appId: com.outthegroupchat.app
---
- launchApp
- assertVisible: "tonight"
- tapOn: "drinks · east williamsburg · 8pm"
- tapOn: "i'm out"
- assertVisible: "you're out"
```

Required Maestro suites:
- `hot-path.yaml` — open → commit
- `block.yaml` — long-press → block → confirm → verify removed
- `report.yaml` — report flow with all 4 categories
- `signup-age-gate.yaml` — DOB <18 blocks; ≥18 proceeds
- `account-delete.yaml` — settings → delete → confirm → signed out

### 18.3 CI

GitHub Actions on PR: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`, `eas build --platform ios --profile preview --non-interactive` (smoke check).

---

## 19. Verification checklist (final go/no-go)

Before tagging `v1.0.0` and submitting to App Store Review:

- [ ] All 15 required features from `iOS_IMPLEMENTATION_PLAN.md §6` shipped
- [ ] Hot-path Maestro test passes ≤30s on iPhone 12 + iPhone 16 Pro
- [ ] Block + Report shipped on every UGC surface (Profile / Meetup / Intent / Crew / Message)
- [ ] EULA loads, accept timestamp persists, version-bump prompts re-accept
- [ ] DOB <18 blocks signup; data not stored
- [ ] Account deletion removes user + cascades all related rows
- [ ] Privacy Manifest declared in iOS bundle; matches App Store Connect Privacy Nutrition Label exactly
- [ ] No `NSUserTrackingUsageDescription` in Info.plist
- [ ] Demo account `appreview+nyc@outthegroupchat.com` seeded with active NYC Crew + Topic + Intent rows; reviewer can complete hot-path on first try
- [ ] Persona selfie liveness completes end-to-end with production template
- [ ] Safe-arrival cron schedules + escalates correctly (test with 1-min override)
- [ ] Panic button: location captured, SMS to emergency contact sent, 911 dialer opens, Sentry alert fires
- [ ] All 5 web-side server changes deployed to production
- [ ] Sentry DSN set in EAS secrets; first error visible in Sentry dashboard
- [ ] Pusher real-time SubCrew alert fires on group formation (two-device test)
- [ ] APNs push delivers in <5s for SubCrew formation
- [ ] Live Activity for SubCrew countdown renders + updates via APNs token
- [ ] App icon, splash, screenshots all uploaded to App Store Connect
- [ ] Review Notes pasted verbatim from `iOS_IMPLEMENTATION_PLAN.md §8`
- [ ] `trust@outthegroupchat.com` inbox staffed, 24h SLA documented
- [ ] EULA + Privacy Policy reviewed by counsel and version-stamped
- [ ] LLC formed, DUNS issued, Apple Developer enrolled, bundle ID registered
- [ ] PWA hedge already live for closed-beta cohort
- [ ] All `LAUNCH_RESEARCH_PORTFOLIO §8` launch-blockers resolved

---

## 20. Common issues & debug notes

- **"Cannot find module @withpersona/..."** — Persona's RN SDK requires `expo prebuild` and a custom dev client. `eas build --profile development` then install the resulting client; `expo start --dev-client`.
- **Live Activity doesn't update via push** — APNs payload must include `apns-push-type: liveactivity` and `apns-topic: com.outthegroupchat.app.push-type.liveactivity`. Server-side Expo Push wrapper does NOT cover Live Activities; use `node-apn` or hand-roll APNs HTTP/2 for these.
- **Build fails on `expo-build-properties` static frameworks** — required for Persona's static linkage; do not switch back to dynamic.
- **Push token registration fails on Simulator** — APNs only works on physical device. Test with internal TestFlight build.
- **`expo-location` background task not firing** — must register the task at module top-level (not inside a hook), and `UIBackgroundModes` must include `location` in `Info.plist`. Already configured in §4.1.
- **Reanimated warning "Reading from `value` during render"** — wrap in `useDerivedValue` or move to `useAnimatedStyle`.
- **Cookie-based NextAuth sessions hit on mobile** — DO NOT use `getServerSession()` cookie reads on Bearer-authenticated routes; refactor to read from `authorization` header. The `/api/auth/mobile/*` adapter exposes a typed user from JWT verification.
- **App Review reject for "incomplete content" (Guideline 4.2)** — demo account region must have ≥3 active Crews + ≥2 active Intents per Topic; reviewer must hit the loop on first try. Re-seed before each resubmission.
- **App Review reject for "UGC moderation insufficient" (1.2)** — never resubmit without screenshotting Block + Report flows in App Store Connect notes; reviewers often miss them in the build.

---

## 21. Reference docs (canonical, read in order)

1. `LAUNCH_RESEARCH_PORTFOLIO.md` — strategy, hot-path UX, trust stack, NYC GTM
2. `PRODUCT_VISION.md` — 25 locked product resolutions (R1-R25)
3. `V1_IMPLEMENTATION_PLAN.md` — 6-phase web-side build plan
4. `iOS_IMPLEMENTATION_PLAN.md` — iOS architecture decision, App Review profile, 12 locked iOS resolutions (Q1-Q12)
5. **`MOBILE_BUILD_ONESHOT.md`** (this doc) — end-to-end build guide

If a decision in this doc conflicts with an upstream doc, upstream wins; this doc only operationalizes them. Re-read PRODUCT_VISION.md before any product-shape change.

---

*Last updated 2026-04-25. Self-contained build guide. Designed to be handed to a coding agent or developer and executed end-to-end. If a step doesn't compile or doesn't match current Expo/Persona/Apple docs, defer to the canonical vendor docs and update this file via PR.*
