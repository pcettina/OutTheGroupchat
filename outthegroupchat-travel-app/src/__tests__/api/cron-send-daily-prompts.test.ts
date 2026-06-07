/**
 * Unit tests for GET /api/cron/send-daily-prompts.
 *
 * Auth: Bearer CRON_SECRET. Delegates selection + notification writes to
 * `sendDailyPrompts` in `@/lib/notifications/daily-prompt`; the handler only
 * enforces auth and surfaces the `{ eligible, sent }` counts. The dispatch lib
 * is mocked here so route-level behavior is isolated from prisma. Sentry mocks
 * come from src/__tests__/setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET } from '@/app/api/cron/send-daily-prompts/route';
import { sendDailyPrompts } from '@/lib/notifications/daily-prompt';

vi.mock('@/lib/notifications/daily-prompt', () => ({
  sendDailyPrompts: vi.fn(),
}));

const mockSendDailyPrompts = vi.mocked(sendDailyPrompts);

const SECRET = 'test-cron-secret';
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockSendDailyPrompts.mockResolvedValue({ eligible: 0, sent: 0 });
});

afterAll(() => {
  if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  else delete process.env.CRON_SECRET;
});

const makeReq = (opts: { secret?: string | null } = {}): Request => {
  const { secret = SECRET } = opts;
  const headers: Record<string, string> = {};
  if (secret !== null) headers['authorization'] = `Bearer ${secret}`;
  return new Request('http://localhost/api/cron/send-daily-prompts', {
    method: 'GET',
    headers,
  });
};

describe('GET /api/cron/send-daily-prompts', () => {
  it('500 when CRON_SECRET env var is missing', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(500);
    expect(mockSendDailyPrompts).not.toHaveBeenCalled();
  });

  it('401 when authorization header is absent', async () => {
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(401);
    expect(mockSendDailyPrompts).not.toHaveBeenCalled();
  });

  it('401 when authorization header is empty string', async () => {
    const res = await GET(makeReq({ secret: '' }));
    expect(res.status).toBe(401);
    expect(mockSendDailyPrompts).not.toHaveBeenCalled();
  });

  it('401 when bearer token does not match', async () => {
    const res = await GET(makeReq({ secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
    expect(mockSendDailyPrompts).not.toHaveBeenCalled();
  });

  it('200 with success and counts when bearer token matches', async () => {
    mockSendDailyPrompts.mockResolvedValueOnce({ eligible: 5, sent: 5 });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, eligible: 5, sent: 5 });
    expect(mockSendDailyPrompts).toHaveBeenCalledTimes(1);
  });

  it('surfaces the exact { eligible, sent } returned by the dispatch lib', async () => {
    mockSendDailyPrompts.mockResolvedValueOnce({ eligible: 9, sent: 7 });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(9);
    expect(body.sent).toBe(7);
  });

  it('500 when the dispatch lib throws', async () => {
    mockSendDailyPrompts.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Cron failed' });
  });
});
