# n8n Beta Signup & Newsletter Integration Guide

> **Last Updated:** December 2025  
> **Status:** ✅ **IMPLEMENTED** - Option 1 (Separate Beta Endpoint)  
> **Purpose:** Connect n8n workflows for beta signups and newsletter subscriptions to user database

## ✅ Implementation Status

**Option 1 has been implemented** - All API endpoints have been created and the codebase is ready for n8n integration.

### Next Steps:
1. ✅ **Code Implementation Complete** - All endpoints created
2. ⏳ **Run Prisma migration** - See [Deployment Checklist](./N8N_DEPLOYMENT_CHECKLIST.md)
3. ⏳ **Set `N8N_API_KEY` environment variable** - See [Deployment Checklist](./N8N_DEPLOYMENT_CHECKLIST.md)
4. ⏳ **Deploy to Vercel** - See [Deployment Checklist](./N8N_DEPLOYMENT_CHECKLIST.md) for full guide
5. ⏳ **Configure n8n workflows** - Use endpoints below after deployment

📋 **See [N8N_DEPLOYMENT_CHECKLIST.md](./N8N_DEPLOYMENT_CHECKLIST.md) for complete deployment instructions**

---

## 📋 Overview

This guide outlines the implementation for connecting n8n workflows to your OutTheGroupchat application to:
1. **Beta Signup Form**: Capture emails from beta signup forms and create passwordless user accounts
2. **Weekly Newsletter**: Subscribe emails to newsletter notifications
3. **Beta Launch**: Enable users to initialize passwords when beta launches (accounts already exist)

### Key Flow

```
n8n Form Submission 
  → API Endpoint (/api/beta/signup)
  → Create User (password: null)
  → Store beta signup metadata
  → Ready for password initialization on beta launch
```

## 🚀 Quick Reference

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/beta/signup` | POST | Create passwordless user from beta signup | API Key |
| `/api/newsletter/subscribe` | POST | Subscribe email to newsletter | API Key |
| `/api/beta/initialize-password` | POST | Set password for beta user | None (public) |
| `/api/beta/status` | GET | Check beta signup status | None |

### n8n Workflow Quick Links
- **Beta Signup Form** → `POST /api/beta/signup` (with `x-api-key` header)
- **Newsletter Form** → `POST /api/newsletter/subscribe` (with `x-api-key` header)
- **Weekly Newsletter** → Query users where `newsletterSubscribed = true`

---

## 🗄️ Database Schema Changes

### Required Prisma Schema Updates

Add the following fields to the `User` model in `prisma/schema.prisma`:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  password      String?   // Already exists - stays nullable
  name          String?
  // ... existing fields ...
  
  // NEW FIELDS FOR BETA/NEWSLETTER
  betaSignupDate    DateTime?   // When they signed up for beta
  newsletterSubscribed Boolean   @default(false)
  newsletterSubscribedAt DateTime?
  passwordInitialized Boolean   @default(false)  // Track if password has been set
  betaLaunchEmailSent Boolean   @default(false)  // Track if beta launch email sent
  
  // ... rest of existing fields ...
}
```

### Migration Steps

1. Update `prisma/schema.prisma` with the new fields
2. Create and run migration:
```bash
npx prisma migrate dev --name add_beta_newsletter_fields
npx prisma generate
```

---

## 🔌 API Endpoints

### 1. Beta Signup Endpoint

**Endpoint:** `POST /api/beta/signup`

**Purpose:** Create a passwordless user account from n8n form submission

**Authentication:** Requires API key in header (for n8n security)

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"  // Optional
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "betaSignupDate": "2024-12-17T10:00:00.000Z",
    "passwordInitialized": false
  }
}
```

**Response (Error - 400):**
```json
{
  "error": "Email already exists" // or "Invalid email format"
}
```

### 2. Newsletter Subscribe Endpoint

**Endpoint:** `POST /api/newsletter/subscribe`

**Purpose:** Subscribe an email to newsletter (can be existing user or new subscriber)

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"  // Optional
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "subscribed": true,
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "newsletterSubscribed": true,
    "newsletterSubscribedAt": "2024-12-17T10:00:00.000Z"
  }
}
```

### 3. Password Initialization Endpoint

**Endpoint:** `POST /api/beta/initialize-password`

**Purpose:** Allow beta users to set their password when beta launches

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "token": "initialization-token"  // Optional security token
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Password initialized successfully"
}
```

**Response (Error - 400):**
```json
{
  "error": "Password already initialized" // or "User not found" or "Invalid token"
}
```

### 4. Check Beta Status Endpoint

**Endpoint:** `GET /api/beta/status?email=user@example.com`

**Purpose:** Check if an email is signed up for beta (useful for n8n workflows)

**Response (Success - 200):**
```json
{
  "exists": true,
  "email": "user@example.com",
  "betaSignupDate": "2024-12-17T10:00:00.000Z",
  "passwordInitialized": false,
  "newsletterSubscribed": true
}
```

---

## 🛠️ Implementation Code

✅ **All endpoints have been created!** The following code has been implemented in your codebase.

### 1. Beta Signup API Route ✅

**File:** `src/app/api/beta/signup/route.ts` - **CREATED**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// API Key validation (set in environment variables)
const N8N_API_KEY = process.env.N8N_API_KEY;

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === N8N_API_KEY;
}

export async function POST(req: Request) {
  try {
    // Validate API key
    if (!validateApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    const { email, name } = await req.json();

    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // User exists - update beta signup date if not set
      if (!existingUser.betaSignupDate) {
        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            betaSignupDate: new Date(),
            name: name || existingUser.name,
          },
        });

        logger.info({ userId: updatedUser.id, email }, 'Updated existing user with beta signup date');
        
        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            betaSignupDate: updatedUser.betaSignupDate,
            passwordInitialized: !!updatedUser.password,
          },
        });
      }

      // User already has beta signup
      return NextResponse.json({
        success: true,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          betaSignupDate: existingUser.betaSignupDate,
          passwordInitialized: !!existingUser.password,
        },
      });
    }

    // Create new user without password
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        password: null, // No password yet
        betaSignupDate: new Date(),
        passwordInitialized: false,
        newsletterSubscribed: false, // Default to false, use newsletter endpoint separately
      },
    });

    logger.info({ userId: user.id, email }, 'Created new beta signup user');

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          betaSignupDate: user.betaSignupDate,
          passwordInitialized: false,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error, context: 'BETA_SIGNUP' }, 'Error during beta signup');
    
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Unable to process signup. Please try again.' },
      { status: 500 }
    );
  }
}
```

### 2. Newsletter Subscribe API Route ✅

**File:** `src/app/api/newsletter/subscribe/route.ts` - **CREATED**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const N8N_API_KEY = process.env.N8N_API_KEY;

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === N8N_API_KEY;
}

export async function POST(req: Request) {
  try {
    // Validate API key
    if (!validateApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    const { email, name } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Update existing user
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          newsletterSubscribed: true,
          newsletterSubscribedAt: new Date(),
          name: name || existingUser.name,
        },
      });

      logger.info({ userId: updatedUser.id, email }, 'Subscribed existing user to newsletter');

      return NextResponse.json({
        success: true,
        subscribed: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          newsletterSubscribed: updatedUser.newsletterSubscribed,
          newsletterSubscribedAt: updatedUser.newsletterSubscribedAt,
        },
      });
    }

    // Create new user for newsletter (passwordless)
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        password: null,
        newsletterSubscribed: true,
        newsletterSubscribedAt: new Date(),
        passwordInitialized: false,
      },
    });

    logger.info({ userId: user.id, email }, 'Created new newsletter subscriber');

    return NextResponse.json({
      success: true,
      subscribed: true,
      user: {
        id: user.id,
        email: user.email,
        newsletterSubscribed: user.newsletterSubscribed,
        newsletterSubscribedAt: user.newsletterSubscribedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error, context: 'NEWSLETTER_SUBSCRIBE' }, 'Error during newsletter subscription');
    
    return NextResponse.json(
      { error: 'Unable to process subscription. Please try again.' },
      { status: 500 }
    );
  }
}
```

### 3. Password Initialization Route ✅

**File:** `src/app/api/beta/initialize-password/route.ts` - **CREATED**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { email, password, token } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if password already initialized
    if (user.password && user.passwordInitialized) {
      return NextResponse.json(
        { error: 'Password already initialized' },
        { status: 400 }
      );
    }

    // Optional: Validate token if provided (for additional security)
    // You can implement token generation/validation logic here
    // For now, we'll allow direct initialization for beta users

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with password
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordInitialized: true,
      },
    });

    logger.info({ userId: updatedUser.id, email }, 'Password initialized for beta user');

    // Process any pending invitations (similar to signup flow)
    try {
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: {
          email: email.toLowerCase(),
          expiresAt: { gt: new Date() },
        },
        include: {
          trip: { select: { title: true } },
        },
      });

      if (pendingInvitations.length > 0) {
        for (const pending of pendingInvitations) {
          await prisma.tripInvitation.create({
            data: {
              tripId: pending.tripId,
              userId: updatedUser.id,
              status: 'PENDING',
              expiresAt: pending.expiresAt,
            },
          });

          await prisma.notification.create({
            data: {
              userId: updatedUser.id,
              type: 'TRIP_INVITATION',
              title: 'Trip Invitation',
              message: `You've been invited to join "${pending.trip.title}"!`,
              data: { tripId: pending.tripId },
            },
          });
        }

        await prisma.pendingInvitation.deleteMany({
          where: { email: email.toLowerCase() },
        });

        logger.info({ userId: updatedUser.id, invitationsProcessed: pendingInvitations.length },
          'Processed pending invitations during password initialization');
      }
    } catch (inviteError) {
      logger.error({ err: inviteError, userId: updatedUser.id },
        'Failed to process pending invitations during password initialization');
    }

    return NextResponse.json({
      success: true,
      message: 'Password initialized successfully',
    });
  } catch (error) {
    logger.error({ err: error, context: 'PASSWORD_INIT' }, 'Error during password initialization');
    
    return NextResponse.json(
      { error: 'Unable to initialize password. Please try again.' },
      { status: 500 }
    );
  }
}
```

### 4. Beta Status Check Route ✅

**File:** `src/app/api/beta/status/route.ts` - **CREATED**

✅ **Existing signup endpoint has been updated** - `/api/auth/signup` now handles beta users setting passwords.

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        betaSignupDate: true,
        passwordInitialized: true,
        newsletterSubscribed: true,
        newsletterSubscribedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        exists: false,
        email: email.toLowerCase(),
      });
    }

    return NextResponse.json({
      exists: true,
      email: user.email,
      betaSignupDate: user.betaSignupDate,
      passwordInitialized: user.passwordInitialized,
      newsletterSubscribed: user.newsletterSubscribed,
      newsletterSubscribedAt: user.newsletterSubscribedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}
```

---

## 📝 Prisma Schema Update

✅ **Schema has been updated** - The beta & newsletter fields have been added to the User model.

### Required Migration

**You need to run the Prisma migration** to add the new fields to your database:

```bash
npx prisma migrate dev --name add_beta_newsletter_fields
npx prisma generate
```

This will add the following fields to your User table:
- `betaSignupDate` (DateTime?)
- `newsletterSubscribed` (Boolean, default: false)
- `newsletterSubscribedAt` (DateTime?)
- `passwordInitialized` (Boolean, default: false)
- `betaLaunchEmailSent` (Boolean, default: false)

---

## 🔐 Environment Variables

Add to your `.env` file:

```env
# n8n Integration API Key
N8N_API_KEY=your-secure-random-api-key-here

# Generate a secure key with:
# openssl rand -base64 32
```

Add to `env.example.txt`:
```env
# n8n Integration
N8N_API_KEY=your-n8n-api-key-here
```

---

## 🎨 n8n Workflow Configuration

### Workflow 1: Beta Signup Form

#### Trigger: Form Trigger (n8n)
- Configure your form trigger with fields:
  - `email` (required, email validation)
  - `name` (optional)

#### Node 1: HTTP Request (POST to Beta Signup)
```
Method: POST
URL: https://your-domain.com/api/beta/signup
Authentication: Header Auth
Header Name: x-api-key
Header Value: {{ $env.N8N_API_KEY }}
Body:
{
  "email": "{{ $json.email }}",
  "name": "{{ $json.name }}"
}
```

#### Node 2: Conditional (Check Success)
- IF `{{ $json.success }} === true`
  - Send success email (optional)
  - Log to database/google sheets (optional)
- ELSE
  - Handle error notification

### Workflow 2: Newsletter Subscription

#### Trigger: Form Trigger or Manual Trigger
- Fields: `email`, `name` (optional)

#### Node 1: HTTP Request (POST to Newsletter Subscribe)
```
Method: POST
URL: https://your-domain.com/api/newsletter/subscribe
Authentication: Header Auth
Header Name: x-api-key
Header Value: {{ $env.N8N_API_KEY }}
Body:
{
  "email": "{{ $json.email }}",
  "name": "{{ $json.name }}"
}
```

#### Node 2: Schedule Newsletter (Weekly)
- Set up a schedule trigger for weekly newsletter
- Query users where `newsletterSubscribed === true`
- Send newsletter email

### Workflow 3: Weekly Newsletter Distribution

#### Trigger: Cron (Weekly - e.g., Every Monday 9 AM)

#### Node 1: HTTP Request (GET from your API to fetch subscribers)
```
Method: GET
URL: https://your-domain.com/api/newsletter/subscribers
(You'll need to create this endpoint to return subscribed users)
```

#### Node 2: Loop through subscribers
#### Node 3: Send Email (using your email service)
- Personalize email with user data
- Include unsubscribe link

---

## 🚀 Beta Launch Flow

### Step 1: Send Beta Launch Email

Create a script or n8n workflow to send beta launch emails to all users where:
- `betaSignupDate IS NOT NULL`
- `passwordInitialized = false`
- `betaLaunchEmailSent = false`

Email should include:
- Welcome message
- Link to initialize password: `https://your-domain.com/auth/initialize-password?email={email}&token={token}`

### Step 2: Password Initialization Page

Create a page at `/auth/initialize-password` that:
1. Validates email and optional token
2. Shows password form
3. Calls `/api/beta/initialize-password`
4. Redirects to login after success

### Step 3: Update Signup Flow

Modify your existing signup endpoint (`/api/auth/signup`) to handle users who already exist from beta signups:

```typescript
// In src/app/api/auth/signup/route.ts

// Check if user exists but has no password (beta signup)
const existingUser = await prisma.user.findUnique({
  where: { email },
});

if (existingUser && !existingUser.password) {
  // User signed up for beta - update with password
  const hashedPassword = await bcrypt.hash(password, 12);
  
  const updatedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      password: hashedPassword,
      name: name || existingUser.name,
      passwordInitialized: true,
    },
  });
  
  // Process pending invitations...
  
  return NextResponse.json({
    success: true,
    user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email },
  });
}

// Otherwise, proceed with normal signup flow...
```

---

## 📊 Testing Checklist

- [ ] Database migration runs successfully
- [ ] API endpoints return correct responses
- [ ] API key authentication works
- [ ] Beta signup creates user without password
- [ ] Newsletter subscription updates existing users
- [ ] Newsletter subscription creates new users if needed
- [ ] Password initialization works for beta users
- [ ] Password initialization processes pending invitations
- [ ] Existing signup flow handles beta users correctly
- [ ] n8n workflows can successfully call endpoints
- [ ] Weekly newsletter workflow functions correctly

---

## 🔒 Security Considerations

1. **API Key Security**
   - Store `N8N_API_KEY` securely in environment variables
   - Never commit API keys to version control
   - Rotate keys periodically

2. **Rate Limiting**
   - Consider adding rate limiting to beta/newsletter endpoints
   - Use your existing Upstash Redis rate limiting

3. **Email Validation**
   - Always validate email format
   - Normalize emails to lowercase
   - Handle duplicate emails gracefully

4. **Password Initialization**
   - Consider adding time-limited tokens for password initialization
   - Add CSRF protection to initialization form
   - Log all password initialization attempts

5. **Privacy**
   - Ensure newsletter subscribers can unsubscribe
   - Comply with GDPR/email regulations
   - Add unsubscribe endpoint

---

## 📚 Additional Endpoints (Optional)

### Unsubscribe from Newsletter

**Endpoint:** `POST /api/newsletter/unsubscribe`

```typescript
// Similar structure to subscribe, but sets newsletterSubscribed = false
```

### Get All Beta Signups

**Endpoint:** `GET /api/beta/users` (Admin only)

```typescript
// Returns list of all beta signups for analytics
// Should be protected with admin authentication
```

---

## 🎯 Next Steps

✅ **Completed:**
1. ✅ **API endpoints implemented** - All endpoints created
2. ✅ **Prisma schema updated** - Fields added to User model
3. ✅ **Existing signup endpoint updated** - Handles beta users setting passwords

**Still Needed:**
1. **Run Prisma migration** - Execute `npx prisma migrate dev --name add_beta_newsletter_fields`
2. **Add environment variable** - Set `N8N_API_KEY` in your `.env` file
3. **Configure n8n workflows** - Use the configuration above to set up your workflows
4. **Test integration** - Test with form submissions before going live
5. **Create password initialization page** - For beta launch (optional, can use existing signup)
6. **Set up weekly newsletter workflow** - In n8n for newsletter distribution
7. **Send beta launch emails** - When ready to launch

---

## 📞 Support

For issues or questions:
1. Check API logs using your logger
2. Verify n8n workflow execution logs
3. Test API endpoints directly with Postman/curl
4. Check database records to verify data persistence

---

**Last Updated:** December 2025  
**Version:** 1.1 - Implementation Complete ✅

