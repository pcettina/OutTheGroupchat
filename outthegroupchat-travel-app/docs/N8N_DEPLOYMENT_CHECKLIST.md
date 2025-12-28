# n8n Integration - Deployment Checklist

> **Purpose:** Step-by-step guide to complete n8n integration setup and deploy to Vercel  
> **Status:** Implementation complete, ready for deployment

---

## ✅ Pre-Deployment Checklist

### 1. Database Migration (Required)

**Run from the project root directory:**

```powershell
# Navigate to project directory
cd OutTheGroupchat\outthegroupchat-travel-app

# Run Prisma migration to add beta/newsletter fields
npx prisma migrate dev --name add_beta_newsletter_fields

# Generate Prisma client
npx prisma generate
```

**Expected Output:**
- Migration file created in `prisma/migrations/`
- Database schema updated with new fields
- Prisma client regenerated

**What this does:**
- Adds `betaSignupDate`, `newsletterSubscribed`, `newsletterSubscribedAt`, `passwordInitialized`, `betaLaunchEmailSent` to User table

---

### 2. Environment Variables

#### Local `.env` file

Add to your local `.env` file:

```env
# n8n Integration API Key
N8N_API_KEY=your-secure-random-api-key-here
```

**Generate secure key:**
```bash
openssl rand -base64 32
```

Or use PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

#### Vercel Environment Variables

**You must add `N8N_API_KEY` to Vercel:**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **Settings** → **Environment Variables**
4. Click **Add New**
5. Enter:
   - **Key:** `N8N_API_KEY`
   - **Value:** Your generated API key (same as local)
   - **Environment:** Select **Production** (and Preview/Development if needed)
6. Click **Save**
7. **IMPORTANT:** Redeploy your application for the variable to take effect

---

### 3. Build Test (Local)

**Test build before deploying:**

```powershell
# From project directory
cd OutTheGroupchat\outthegroupchat-travel-app

# Generate Prisma client and build
npm run build
```

**Expected Result:**
- Prisma client generated successfully
- Next.js build completes without errors
- Build output in `.next/` directory

**If build fails:**
- Check for TypeScript errors
- Verify all imports are correct
- Ensure Prisma schema is valid

---

## 🚀 Deployment to Vercel

### Option 1: Git Push (Automatic Deployment)

If your repository is connected to Vercel:

```powershell
# Commit your changes
git add .
git commit -m "Add n8n beta signup and newsletter endpoints"

# Push to main branch (triggers automatic deployment)
git push origin main
```

**Vercel will automatically:**
1. Detect the push
2. Install dependencies
3. Run `npm run build` (which includes `prisma generate`)
4. Deploy to production

### Option 2: Vercel CLI (Manual Deployment)

```powershell
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project directory)
cd OutTheGroupchat\outthegroupchat-travel-app
vercel --prod
```

---

## 🔍 Post-Deployment Verification

### 1. Get Your Deployment URL

After deployment, you'll get a URL like:
- `https://outthegroupchat.vercel.app` (production)
- Or check Vercel dashboard for your project URL

### 2. Test API Endpoints

**Test Beta Signup Endpoint:**

```powershell
# Replace YOUR_API_KEY and YOUR_DOMAIN with actual values
$apiKey = "your-api-key-here"
$domain = "https://your-app.vercel.app"

# Test beta signup
Invoke-RestMethod -Uri "$domain/api/beta/signup" `
  -Method POST `
  -Headers @{"x-api-key"="$apiKey"; "Content-Type"="application/json"} `
  -Body '{"email":"test@example.com","name":"Test User"}' | ConvertTo-Json
```

**Expected Response:**
```json
{
  "success": true,
  "user": {
    "id": "clx...",
    "email": "test@example.com",
    "name": "Test User",
    "betaSignupDate": "2025-12-28T...",
    "passwordInitialized": false
  }
}
```

**Test Newsletter Subscribe:**

```powershell
Invoke-RestMethod -Uri "$domain/api/newsletter/subscribe" `
  -Method POST `
  -Headers @{"x-api-key"="$apiKey"; "Content-Type"="application/json"} `
  -Body '{"email":"newsletter@example.com","name":"Newsletter User"}' | ConvertTo-Json
```

**Test Status Check:**

```powershell
Invoke-RestMethod -Uri "$domain/api/beta/status?email=test@example.com" | ConvertTo-Json
```

---

## 📋 n8n Workflow Configuration

### Step 1: Get Your API Endpoint URL

Your n8n HTTP Request URLs will be:
- **Beta Signup:** `https://YOUR-DOMAIN.vercel.app/api/beta/signup`
- **Newsletter:** `https://YOUR-DOMAIN.vercel.app/api/newsletter/subscribe`

### Step 2: Configure HTTP Request Node

**In n8n workflow:**

1. **Add HTTP Request Node**
2. **Method:** POST
3. **URL:** `https://YOUR-DOMAIN.vercel.app/api/beta/signup`
4. **Headers:**
   - Name: `x-api-key`
   - Value: Your `N8N_API_KEY` value
5. **Body (JSON):**
   ```json
   {
     "email": "{{ $json.email }}",
     "name": "{{ $json.name }}"
   }
   ```

### Step 3: Test Workflow

1. Execute workflow with test data
2. Check HTTP Request node output
3. Verify user was created in database

---

## 🐛 Troubleshooting

### Migration Issues

**Error: "Could not find Prisma Schema"**
- **Solution:** Make sure you're in the `OutTheGroupchat\outthegroupchat-travel-app` directory

**Error: "Database connection failed"**
- **Solution:** Check your `DATABASE_URL` in `.env` file
- Ensure you're using Supabase pooler URL (port 6543)

**Error: "Migration failed"**
- **Solution:** Check if fields already exist in database
- Try: `npx prisma db push` as alternative to migration

### Build Issues

**Error: "Module not found"**
- **Solution:** Run `npm install` to ensure all dependencies are installed

**Error: TypeScript errors**
- **Solution:** Check for any syntax errors in new endpoint files
- Run `npm run lint` to find issues

### Deployment Issues

**Error: "Environment variable not found"**
- **Solution:** Ensure `N8N_API_KEY` is set in Vercel dashboard
- Redeploy after adding environment variable

**Error: "API endpoint returns 401 Unauthorized"**
- **Solution:** Check that `x-api-key` header matches `N8N_API_KEY` in Vercel
- Verify API key is set for Production environment

**Error: "500 Internal Server Error"**
- **Solution:** Check Vercel function logs
- Verify database connection is working
- Check that Prisma client is generated (should happen during build)

### n8n Integration Issues

**Error: "Invalid API key"**
- **Solution:** Double-check header name is exactly `x-api-key`
- Verify API key value matches Vercel environment variable
- Ensure no extra spaces in API key

**Error: "Email already exists"**
- **Solution:** This is expected if email was already in database
- Endpoint will return success if user already exists

---

## ✅ Final Checklist Before Going Live

- [ ] Database migration completed successfully
- [ ] Prisma client generated
- [ ] Local build passes (`npm run build`)
- [ ] `N8N_API_KEY` added to Vercel environment variables
- [ ] Application deployed to Vercel
- [ ] API endpoints tested with curl/Postman
- [ ] n8n workflow configured with correct URL
- [ ] n8n workflow tested with sample data
- [ ] User records verified in database
- [ ] Error handling working correctly

---

## 📞 Quick Commands Reference

```powershell
# Navigate to project
cd OutTheGroupchat\outthegroupchat-travel-app

# Run migration
npx prisma migrate dev --name add_beta_newsletter_fields
npx prisma generate

# Test build
npm run build

# Check Prisma schema
npx prisma studio

# View logs (if using Vercel CLI)
vercel logs

# Deploy to Vercel
vercel --prod
```

---

## 🔗 Important URLs After Deployment

Once deployed, you'll have:

1. **Production URL:** `https://YOUR-PROJECT.vercel.app`
2. **Beta Signup Endpoint:** `https://YOUR-PROJECT.vercel.app/api/beta/signup`
3. **Newsletter Endpoint:** `https://YOUR-PROJECT.vercel.app/api/newsletter/subscribe`
4. **Status Check:** `https://YOUR-PROJECT.vercel.app/api/beta/status?email=test@example.com`

---

**Last Updated:** December 2025  
**Next Step:** Complete migration → Deploy → Configure n8n workflows

