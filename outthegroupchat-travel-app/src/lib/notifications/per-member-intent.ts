/**
 * @module lib/notifications/per-member-intent
 * @description V1 Phase 5 per-member-intent dispatch (R8).
 *
 * A user opts in to be alerted whenever a *specific* Crew partner signals an
 * Intent: they enable the `PER_MEMBER_INTENT` NotificationPreference and add
 * the watched author's userId to its `perMemberTargets` array. When that
 * author creates an Intent, this module notifies every watcher who flagged
 * them.
 *
 * Eligibility is two-layered:
 *   1. A NotificationPreference row with `trigger = PER_MEMBER_INTENT`,
 *      `enabled = true`, and `perMemberTargets` containing the author's
 *      userId (the author themselves is excluded).
 *   2. A relationship guard — the watcher must be an ACCEPTED Crew partner of
 *      the author. This prevents notifying a user who flagged someone they are
 *      no longer (or never were) Crew with.
 *
 * Each eligible watcher receives a `SYSTEM` Notification (there is no
 * dedicated NotificationType for this trigger in v1; the `data.kind`
 * discriminator carries the semantic) deep-linking to the Intent.
 *
 * Individual notification-write failures are logged and skipped so one bad row
 * never aborts the whole batch; the function returns counts of how many
 * watchers were eligible and how many notifications were actually sent.
 */

import type { PrismaClient, Prisma, Intent } from '@prisma/client';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

/** Subset of Prisma client surface needed for per-member-intent dispatch. */
export type PerMemberIntentPrisma = Pick<
  PrismaClient,
  'notificationPreference' | 'notification' | 'crew' | 'topic' | 'user'
>;

/** Result of a per-member-intent dispatch pass. */
export interface PerMemberIntentResult {
  /** Number of watchers eligible after the preference + Crew guard. */
  eligible: number;
  /** Number of Notification rows successfully created. */
  sent: number;
}

/**
 * Notify every Crew partner who opted in to be alerted about this Intent's
 * author, creating a SYSTEM Notification for each.
 *
 * @param intent The Intent that was just created.
 * @param prisma Prisma client (injected so the route and tests can share a
 *   single instance / mock) with the
 *   `notificationPreference/notification/crew/topic/user` delegates.
 * @returns Counts of eligible watchers and notifications actually sent.
 */
export async function dispatchPerMemberIntent(
  intent: Intent,
  prisma: PerMemberIntentPrisma,
): Promise<PerMemberIntentResult> {
  // 1. Find watchers who flagged this author via PER_MEMBER_INTENT. Exclude
  //    the author themselves (a user can't watch their own Intents).
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      trigger: 'PER_MEMBER_INTENT',
      enabled: true,
      perMemberTargets: { has: intent.userId },
      userId: { not: intent.userId },
    },
    select: { userId: true },
  });

  if (preferences.length === 0) {
    apiLogger.info(
      { context: 'PER_MEMBER_INTENT_DISPATCH', intentId: intent.id, eligible: 0, sent: 0 },
      'Per-member-intent dispatch completed (no watchers)',
    );
    return { eligible: 0, sent: 0 };
  }

  const watcherIds = preferences.map((p) => p.userId);

  // 2. Relationship guard — only notify watchers who are ACCEPTED Crew
  //    partners of the author (R8). Mirrors the Crew query in
  //    subcrew/try-form.ts.
  const crewRows = await prisma.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userAId: intent.userId, userBId: { in: watcherIds } },
        { userBId: intent.userId, userAId: { in: watcherIds } },
      ],
    },
    select: { userAId: true, userBId: true },
  });

  const crewPartnerIds = new Set(
    crewRows.map((row) =>
      row.userAId === intent.userId ? row.userBId : row.userAId,
    ),
  );

  const eligibleWatchers = watcherIds.filter((id) => crewPartnerIds.has(id));
  const eligible = eligibleWatchers.length;

  if (eligible === 0) {
    apiLogger.info(
      { context: 'PER_MEMBER_INTENT_DISPATCH', intentId: intent.id, eligible: 0, sent: 0 },
      'Per-member-intent dispatch completed (no eligible Crew watchers)',
    );
    return { eligible: 0, sent: 0 };
  }

  // 3. Resolve the human-readable Topic label and the author's display name
  //    for the notification copy. Fall back to neutral phrasing if missing.
  const [topic, author] = await Promise.all([
    prisma.topic.findUnique({
      where: { id: intent.topicId },
      select: { displayName: true },
    }),
    prisma.user.findUnique({
      where: { id: intent.userId },
      select: { name: true },
    }),
  ]);

  const topicLabel = topic?.displayName ?? 'something';
  const authorName = author?.name ?? 'A Crew member';

  const title = `${authorName} is up for ${topicLabel}`;
  const message = `${authorName} just signaled an Intent — open it to join in.`;
  const link = `/intents/${intent.id}`;

  let sent = 0;

  for (const watcherId of eligibleWatchers) {
    try {
      await prisma.notification.create({
        data: {
          userId: watcherId,
          type: 'SYSTEM',
          title,
          message,
          data: {
            kind: 'PER_MEMBER_INTENT',
            authorUserId: intent.userId,
            intentId: intent.id,
            topicId: intent.topicId,
            link,
          } as Prisma.InputJsonValue,
        },
      });
      sent += 1;
    } catch (error) {
      // Never abort the batch on a single bad row — log and continue.
      captureException(error);
      apiLogger.error(
        { context: 'PER_MEMBER_INTENT_DISPATCH', intentId: intent.id, watcherId, error },
        'Failed to create per-member-intent notification',
      );
    }
  }

  apiLogger.info(
    { context: 'PER_MEMBER_INTENT_DISPATCH', intentId: intent.id, eligible, sent },
    'Per-member-intent dispatch completed',
  );

  return { eligible, sent };
}
