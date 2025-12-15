# OutTheGroupchat - Test Cases

## Overview

This document outlines the test cases needed to validate the OutTheGroupchat platform. Tests are organized by type and priority.

---

## Testing Stack Recommendation

```bash
# Install testing dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm install -D @playwright/test
npm install -D msw  # Mock Service Worker for API mocking
```

### Configuration Files Needed

**`vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**`playwright.config.ts`**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Unit Tests

### 1. Services Layer

#### Survey Service (`src/services/survey.service.ts`)

```typescript
// tests/unit/services/survey.service.test.ts

describe('SurveyService', () => {
  describe('parseSurveyData', () => {
    it('should parse empty responses correctly', () => {
      const result = parseSurveyData([]);
      expect(result.totalResponses).toBe(0);
      expect(result.responseRate).toBe(0);
    });

    it('should calculate budget analysis from responses', () => {
      const responses = [
        { answers: { budget: 500 } },
        { answers: { budget: 1000 } },
        { answers: { budget: 750 } },
      ];
      const result = analyzeBudgets(responses);
      expect(result.min).toBe(500);
      expect(result.max).toBe(1000);
      expect(result.groupOptimal).toBeCloseTo(750);
    });

    it('should handle missing budget answers', () => {
      const responses = [
        { answers: {} },
        { answers: { budget: 500 } },
      ];
      const result = analyzeBudgets(responses);
      expect(result.min).toBe(500);
    });
  });

  describe('analyzeDatePreferences', () => {
    it('should find optimal date range', () => {
      const responses = [
        { answers: { dates: { start: '2025-07-01', end: '2025-07-05' } } },
        { answers: { dates: { start: '2025-07-03', end: '2025-07-07' } } },
      ];
      const result = analyzeDatePreferences(responses);
      // Should find overlapping dates
      expect(new Date(result.optimalRange.start)).toBeInstanceOf(Date);
    });

    it('should handle non-overlapping dates', () => {
      const responses = [
        { answers: { dates: { start: '2025-07-01', end: '2025-07-05' } } },
        { answers: { dates: { start: '2025-08-01', end: '2025-08-05' } } },
      ];
      const result = analyzeDatePreferences(responses);
      expect(result.optimalRange).toBeDefined();
    });
  });

  describe('analyzeActivityPreferences', () => {
    it('should rank activities by popularity', () => {
      const responses = [
        { answers: { activities: ['hiking', 'food', 'beach'] } },
        { answers: { activities: ['food', 'hiking', 'shopping'] } },
        { answers: { activities: ['food', 'beach', 'nightlife'] } },
      ];
      const result = analyzeActivityPreferences(responses);
      expect(result[0].activity).toBe('food');
    });
  });
});
```

#### Recommendation Service (`src/services/recommendation.service.ts`)

```typescript
// tests/unit/services/recommendation.service.test.ts

describe('RecommendationService', () => {
  describe('generateTripRecommendations', () => {
    it('should generate recommendations from survey analysis', () => {
      const analysis = {
        budgetAnalysis: { groupOptimal: 1000, min: 500, max: 1500 },
        dateAnalysis: { optimalRange: { start: new Date(), end: new Date() } },
        locationPreferences: [{ location: 'Nashville', score: 10 }],
        activityPreferences: [{ activity: 'music', score: 10 }],
      };
      
      const result = generateTripRecommendations(analysis, []);
      expect(result).toHaveProperty('destinations');
      expect(result).toHaveProperty('suggestedBudget');
    });
  });

  describe('calculateTripBudget', () => {
    it('should calculate per-person budget correctly', () => {
      const result = calculateTripBudget(3000, 6);
      expect(result.perPerson).toBe(500);
    });
  });
});
```

### 2. AI Layer

#### Client (`src/lib/ai/client.ts`)

```typescript
// tests/unit/lib/ai/client.test.ts

describe('AI Client', () => {
  describe('checkRateLimit', () => {
    it('should allow requests under limit', () => {
      const result = checkRateLimit('user-1', 5, 60000);
      expect(result).toBe(true);
    });

    it('should block requests over limit', () => {
      const userId = 'user-rate-limit-test';
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        checkRateLimit(userId, 5, 60000);
      }
      // 6th should fail
      const result = checkRateLimit(userId, 5, 60000);
      expect(result).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const text = 'This is a test string with some words.';
      const result = estimateTokens(text);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(20);
    });
  });

  describe('estimateCost', () => {
    it('should calculate GPT-4o cost correctly', () => {
      const result = estimateCost(1000, 500, 'gpt-4o');
      expect(result).toBeGreaterThan(0);
    });
  });
});
```

#### Embeddings (`src/lib/ai/embeddings.ts`)

```typescript
// tests/unit/lib/ai/embeddings.test.ts

describe('Embeddings', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const result = cosineSimilarity(vec, vec);
      expect(result).toBeCloseTo(1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const result = cosineSimilarity(vec1, vec2);
      expect(result).toBeCloseTo(0);
    });

    it('should throw for different length vectors', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });
  });

  describe('InMemoryVectorStore', () => {
    it('should add and search items', async () => {
      const store = new InMemoryVectorStore();
      await store.add({ id: '1', text: 'Beach vacation in Miami' });
      await store.add({ id: '2', text: 'Mountain hiking in Colorado' });
      
      const results = await store.search('beach', 1);
      expect(results[0].item.id).toBe('1');
    });
  });

  describe('buildActivityText', () => {
    it('should combine activity fields', () => {
      const activity = {
        name: 'Broadway Bar Crawl',
        description: 'Live music experience',
        category: 'NIGHTLIFE',
      };
      const result = buildActivityText(activity);
      expect(result).toContain('Broadway Bar Crawl');
      expect(result).toContain('Live music');
    });
  });
});
```

### 3. Components

#### TripCard (`src/components/trips/TripCard.tsx`)

```typescript
// tests/unit/components/TripCard.test.tsx

import { render, screen } from '@testing-library/react';
import TripCard from '@/components/trips/TripCard';

describe('TripCard', () => {
  const mockTrip = {
    id: 'trip-1',
    title: 'Nashville Adventure',
    description: 'Fun trip with friends',
    destination: { city: 'Nashville', country: 'USA' },
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-07-05'),
    status: 'PLANNING' as const,
    _count: { members: 4 },
  };

  it('should render trip title', () => {
    render(<TripCard trip={mockTrip} />);
    expect(screen.getByText('Nashville Adventure')).toBeInTheDocument();
  });

  it('should show destination', () => {
    render(<TripCard trip={mockTrip} />);
    expect(screen.getByText(/Nashville, USA/)).toBeInTheDocument();
  });

  it('should display member count', () => {
    render(<TripCard trip={mockTrip} />);
    expect(screen.getByText('4 members')).toBeInTheDocument();
  });

  it('should show status badge', () => {
    render(<TripCard trip={mockTrip} />);
    expect(screen.getByText('Planning')).toBeInTheDocument();
  });

  it('should link to trip detail page', () => {
    render(<TripCard trip={mockTrip} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/trips/trip-1');
  });
});
```

#### QuestionRenderer (`src/components/surveys/QuestionRenderer.tsx`)

```typescript
// tests/unit/components/QuestionRenderer.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import QuestionRenderer from '@/components/surveys/QuestionRenderer';

describe('QuestionRenderer', () => {
  describe('SingleChoice', () => {
    it('should render all options', () => {
      const question = {
        id: 'q1',
        type: 'single_choice' as const,
        question: 'Pick one',
        required: true,
        options: ['Option A', 'Option B', 'Option C'],
      };
      
      render(<QuestionRenderer question={question} value="" onChange={() => {}} />);
      
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
      expect(screen.getByText('Option C')).toBeInTheDocument();
    });

    it('should call onChange when option selected', () => {
      const onChange = vi.fn();
      const question = {
        id: 'q1',
        type: 'single_choice' as const,
        question: 'Pick one',
        required: true,
        options: ['Option A', 'Option B'],
      };
      
      render(<QuestionRenderer question={question} value="" onChange={onChange} />);
      fireEvent.click(screen.getByText('Option A'));
      
      expect(onChange).toHaveBeenCalledWith('Option A');
    });
  });

  describe('BudgetSlider', () => {
    it('should render with min/max values', () => {
      const question = {
        id: 'budget',
        type: 'budget' as const,
        question: 'Your budget?',
        required: true,
        min: 500,
        max: 2000,
      };
      
      render(<QuestionRenderer question={question} value={1000} onChange={() => {}} />);
      
      expect(screen.getByText('$500')).toBeInTheDocument();
      expect(screen.getByText('$2,000')).toBeInTheDocument();
    });
  });
});
```

---

## Integration Tests

### API Routes

#### Trips API

```typescript
// tests/integration/api/trips.test.ts

import { createMocks } from 'node-mocks-http';
import { GET, POST } from '@/app/api/trips/route';

describe('/api/trips', () => {
  describe('GET', () => {
    it('should return 401 without authentication', async () => {
      const { req, res } = createMocks({ method: 'GET' });
      const response = await GET(req);
      expect(response.status).toBe(401);
    });

    it('should return user trips when authenticated', async () => {
      // Mock session
      const { req, res } = createMocks({ method: 'GET' });
      // ... mock authentication
      const response = await GET(req);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('data');
    });
  });

  describe('POST', () => {
    it('should create a trip with valid data', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          title: 'Test Trip',
          destination: { city: 'Miami', country: 'USA' },
          startDate: '2025-07-01',
          endDate: '2025-07-05',
        },
      });
      
      const response = await POST(req);
      expect(response.status).toBe(201);
    });

    it('should reject invalid trip data', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          title: '', // Invalid: empty title
        },
      });
      
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });
});
```

#### AI API

```typescript
// tests/integration/api/ai.test.ts

describe('/api/ai/generate-itinerary', () => {
  it('should generate itinerary for valid trip', async () => {
    // This test requires mocking the AI service
    const response = await fetch('/api/ai/generate-itinerary', {
      method: 'POST',
      body: JSON.stringify({ tripId: 'test-trip-id' }),
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data.itinerary).toHaveProperty('days');
  });

  it('should rate limit excessive requests', async () => {
    // Make many requests quickly
    const responses = await Promise.all(
      Array(15).fill(null).map(() =>
        fetch('/api/ai/generate-itinerary', {
          method: 'POST',
          body: JSON.stringify({ tripId: 'test-trip-id' }),
        })
      )
    );
    
    const rateLimited = responses.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
  });
});
```

### Database Operations

```typescript
// tests/integration/db/trips.test.ts

import { prisma } from '@/lib/prisma';

describe('Trip Database Operations', () => {
  const testUser = {
    email: 'test@example.com',
    name: 'Test User',
  };

  let userId: string;
  let tripId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: testUser });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('should create a trip', async () => {
    const trip = await prisma.trip.create({
      data: {
        title: 'Test Trip',
        destination: { city: 'Test', country: 'USA' },
        startDate: new Date(),
        endDate: new Date(),
        ownerId: userId,
      },
    });
    
    tripId = trip.id;
    expect(trip.title).toBe('Test Trip');
  });

  it('should add members to trip', async () => {
    await prisma.tripMember.create({
      data: {
        tripId,
        userId,
        role: 'OWNER',
      },
    });

    const members = await prisma.tripMember.findMany({
      where: { tripId },
    });
    
    expect(members).toHaveLength(1);
  });

  it('should cascade delete trip data', async () => {
    await prisma.trip.delete({ where: { id: tripId } });
    
    const members = await prisma.tripMember.findMany({
      where: { tripId },
    });
    
    expect(members).toHaveLength(0);
  });
});
```

---

## End-to-End Tests

### Critical User Flows

```typescript
// tests/e2e/trips.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Trip Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.click('text=Sign In');
    await page.fill('input[name="email"]', 'alex@demo.com');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/trips');
  });

  test('should create a new trip', async ({ page }) => {
    // Navigate to new trip
    await page.click('text=New Trip');
    await page.waitForURL('/trips/new');
    
    // Step 1: Basics
    await page.fill('input[name="title"]', 'E2E Test Trip');
    await page.fill('textarea[name="description"]', 'Testing trip creation');
    await page.click('text=Continue');
    
    // Step 2: Destination
    await page.fill('input[placeholder="Nashville"]', 'Austin');
    await page.fill('input[placeholder="USA"]', 'USA');
    await page.click('text=Continue');
    
    // Step 3: Dates
    await page.fill('input[name="startDate"]', '2025-07-01');
    await page.fill('input[name="endDate"]', '2025-07-05');
    await page.click('text=Continue');
    
    // Step 4: Details
    await page.fill('input[placeholder="2500"]', '2000');
    await page.click('text=Create Trip');
    
    // Verify redirect to trip page
    await expect(page).toHaveURL(/\/trips\/[\w-]+/);
    await expect(page.locator('h1')).toContainText('E2E Test Trip');
  });

  test('should view trip details', async ({ page }) => {
    await page.click('.trip-card >> nth=0');
    await expect(page.locator('[data-testid="trip-header"]')).toBeVisible();
  });
});

test.describe('Survey Flow', () => {
  test('should complete a trip survey', async ({ page }) => {
    await page.goto('/trips/test-trip-id/survey');
    
    // Answer questions
    await page.click('text=Sept 15-18');
    await page.click('text=Next');
    
    // Budget slider
    await page.fill('input[type="range"]', '800');
    await page.click('text=Next');
    
    // Ranking (move items)
    await page.click('[data-testid="move-up-1"]');
    await page.click('text=Submit Survey');
    
    // Verify completion
    await expect(page.locator('text=Survey submitted')).toBeVisible();
  });
});

test.describe('Voting Flow', () => {
  test('should cast a vote', async ({ page }) => {
    await page.goto('/trips/test-trip-id/vote');
    
    // Select an option
    await page.click('[data-testid="voting-option-1"]');
    
    // Submit vote
    await page.click('text=Submit Vote');
    
    // Verify results shown
    await expect(page.locator('[data-testid="voting-results"]')).toBeVisible();
  });
});
```

### Authentication Flow

```typescript
// tests/e2e/auth.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Sign In');
    await expect(page.locator('form')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'alex@demo.com');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('/trips');
    await expect(page.locator('text=Your Trips')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'alex@demo.com');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/trips');
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Sign Out');
    
    await expect(page.locator('text=Sign In')).toBeVisible();
  });
});
```

### AI Features

```typescript
// tests/e2e/ai.spec.ts

import { test, expect } from '@playwright/test';

test.describe('AI Features', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to a trip
    await page.goto('/trips/test-trip-id');
  });

  test('should generate AI itinerary', async ({ page }) => {
    await page.click('text=Itinerary');
    await page.click('text=Generate with AI');
    
    // Wait for generation (may take time)
    await expect(page.locator('[data-testid="itinerary-days"]'))
      .toBeVisible({ timeout: 30000 });
    
    // Verify days exist
    await expect(page.locator('[data-testid="itinerary-day"]'))
      .toHaveCount.greaterThan(0);
  });

  test('should chat with AI assistant', async ({ page }) => {
    await page.click('text=Chat');
    
    await page.fill('input[placeholder="Ask about your trip..."]', 
      'What are the best restaurants in Nashville?');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await expect(page.locator('[data-testid="ai-response"]'))
      .toBeVisible({ timeout: 20000 });
  });
});
```

---

## Test Data Fixtures

```typescript
// tests/fixtures/trips.ts

export const mockTrips = [
  {
    id: 'trip-1',
    title: 'Nashville Summer Adventure',
    description: 'Long weekend in Music City',
    destination: { city: 'Nashville', country: 'USA' },
    startDate: new Date('2025-07-04'),
    endDate: new Date('2025-07-07'),
    status: 'PLANNING',
    budget: { total: 2500, currency: 'USD' },
  },
  {
    id: 'trip-2',
    title: 'Austin Music & BBQ',
    description: 'SXSW vibes without the crowds',
    destination: { city: 'Austin', country: 'USA' },
    startDate: new Date('2025-09-15'),
    endDate: new Date('2025-09-18'),
    status: 'SURVEYING',
    budget: { total: 2000, currency: 'USD' },
  },
];

export const mockUsers = [
  {
    id: 'user-1',
    email: 'alex@demo.com',
    name: 'Alex Johnson',
    preferences: {
      travelStyle: 'adventure',
      interests: ['hiking', 'photography', 'food'],
    },
  },
  {
    id: 'user-2',
    email: 'jordan@demo.com',
    name: 'Jordan Smith',
    preferences: {
      travelStyle: 'relaxation',
      interests: ['beach', 'sports', 'nightlife'],
    },
  },
];

export const mockSurvey = {
  id: 'survey-1',
  tripId: 'trip-2',
  title: 'Austin Trip Preferences',
  status: 'ACTIVE',
  questions: [
    {
      id: 'availability',
      type: 'multiple_choice',
      question: 'When are you available?',
      required: true,
      options: ['Sept 15-18', 'Sept 22-25', 'Oct 1-4'],
    },
    {
      id: 'budget',
      type: 'budget',
      question: "What's your budget?",
      required: true,
      min: 300,
      max: 1500,
    },
  ],
};
```

---

## Running Tests

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test && npm run test:e2e"
  }
}
```

### Commands

```bash
# Run unit tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with Playwright UI
npm run test:e2e:ui

# Run all tests
npm run test:all
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml

name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:coverage
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Test Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Unit Tests | 80% | TBD |
| Integration Tests | 70% | TBD |
| E2E Tests | Critical paths | TBD |

### Priority Test Areas

1. **Critical** (Must have 90%+ coverage)
   - Authentication flows
   - Trip CRUD operations
   - Payment processing (when implemented)

2. **High** (Must have 80%+ coverage)
   - Survey submission
   - Voting system
   - AI itinerary generation

3. **Medium** (Target 70% coverage)
   - Social features
   - Notifications
   - Search functionality

4. **Low** (Target 50% coverage)
   - UI animations
   - Admin features
   - Analytics

---

*Last Updated: December 2024*

