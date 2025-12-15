# Vercel Environment Variables Setup Guide

## Required Environment Variables

Add these in your Vercel Dashboard: **Settings** > **Environment Variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase pooler connection string |
| `DIRECT_URL` | Yes | Supabase direct connection for migrations |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `NEXTAUTH_SECRET` | Yes | Random 32-byte base64 string |
| `NEXTAUTH_URL` | Yes | Production URL (e.g., `https://yourapp.vercel.app`) |

## Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | For AI chat features |
| `ANTHROPIC_API_KEY` | Alternative AI provider |
| `PUSHER_APP_ID` | Real-time features |
| `PUSHER_KEY` | Real-time features |
| `PUSHER_SECRET` | Real-time features |
| `PUSHER_CLUSTER` | Real-time features |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |

## Getting Credentials

### Supabase (Database)
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select project > **Settings** > **Database**
3. Under **Connection string**, select **URI** format
4. Use **Transaction** mode (port 6543) for `DATABASE_URL`
5. Use **Session** mode (port 5432) for `DIRECT_URL`

### Upstash (Redis)
1. Go to [console.upstash.com](https://console.upstash.com)
2. Select your Redis database
3. Find **REST API** section
4. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### NextAuth Secret
Generate with:
```bash
openssl rand -base64 32
```

## Vercel Configuration Steps

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **Settings** > **Environment Variables**
4. Add each variable for all environments (Production, Preview, Development)
5. Click **Save**
6. Redeploy your app for changes to take effect

## Verify Setup

After deployment, test:
- `https://yourapp.vercel.app/api/auth/session` - Should return session info
- `https://yourapp.vercel.app/feed` - Should load feed page
- `https://yourapp.vercel.app/profile` - Should show profile (if logged in)

## Troubleshooting

### Database Connection Errors
- Ensure you're using the **pooler** URL (port 6543) for `DATABASE_URL`
- Check that `?pgbouncer=true` is appended to the URL

### Rate Limiting Not Working
- Verify Upstash credentials are correct
- Check Upstash dashboard for request logs

### Auth Errors
- Ensure `NEXTAUTH_URL` matches your deployed domain exactly
- Verify `NEXTAUTH_SECRET` is set (any random value works)
