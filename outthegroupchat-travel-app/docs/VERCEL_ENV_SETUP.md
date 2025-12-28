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

| Variable | Description | Status |
|----------|-------------|--------|
| `OPENAI_API_KEY` | For AI chat features | ⚠️ **NOT SET** - See troubleshooting below |
| `ANTHROPIC_API_KEY` | Alternative AI provider | Optional |
| `RESEND_API_KEY` | Email service (Resend) | ✅ SET Dec 17 |
| `EMAIL_FROM` | Email sender address | ✅ SET Dec 17 (onboarding@resend.dev) |
| `N8N_API_KEY` | n8n workflow authentication for beta/newsletter endpoints | ⚠️ **REQUIRED FOR N8N** - See N8N_DEPLOYMENT_CHECKLIST.md |
| `PUSHER_APP_ID` | Real-time features | Not set |
| `PUSHER_KEY` | Real-time features | Not set |
| `PUSHER_SECRET` | Real-time features | Not set |
| `PUSHER_CLUSTER` | Real-time features | Not set |
| `GOOGLE_CLIENT_ID` | Google OAuth | Not set |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Not set |

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
- `https://yourapp.vercel.app/api/ai/chat` - Should connect to OpenAI (POST)
- Email invitations - Should send via Resend

## Email Service Setup (Resend)

### Getting Resend API Key
1. Go to [resend.com](https://resend.com)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Create a new API key
5. Copy the key (starts with `re_`)

### Email Configuration
- **For Testing:** Use `EMAIL_FROM=onboarding@resend.dev` (no verification needed)
- **For Production:** Verify your domain in Resend dashboard and use `EMAIL_FROM=noreply@yourdomain.com`

### Email Delivery Notes
- Emails may go to spam folder initially
- For production, set up SPF/DKIM records for better deliverability
- Monitor Resend dashboard for delivery rates

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

### AI Chat Not Working (OPENAI_API_KEY Missing)
**Symptom:** AI chat returns 503 error: "AI service is not configured"

**Diagnosis from Logs:**
Check Vercel logs for entries like:
```json
{
  "hasEnvVar": false,
  "envVarLength": 0,
  "envVarPrefix": "none",
  "envVarType": "undefined"
}
```

**Fix:**
1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Click **Add New**
3. **Key:** `OPENAI_API_KEY`
4. **Value:** Your OpenAI API key (starts with `sk-`)
5. **IMPORTANT:** Select **Production** environment (or "All Environments")
6. Click **Save**
7. **Redeploy** your application (or wait for next deployment)

**Getting OpenAI API Key:**
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create account
3. Click **Create new secret key**
4. Copy the key (starts with `sk-`)
5. Paste into Vercel environment variables

**Verification:**
After redeploying, check logs again. Should see:
- `hasEnvVar: true`
- `envVarLength: > 0` (typically 51+ characters)
- `envVarPrefix: "sk-..."`

**Common Mistakes:**
- ❌ Setting variable only for Preview/Development, not Production
- ❌ Forgetting to redeploy after adding variable
- ❌ Using wrong variable name (must be exactly `OPENAI_API_KEY`)
- ❌ Copying key with extra spaces or newlines
