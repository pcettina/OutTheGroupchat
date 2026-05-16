'use client';

import { sanitizeText } from './sanitize';
import type { PostPayload } from './types';

export function PostCreatedCard({ post }: { post: PostPayload }) {
  const safeContent = sanitizeText(post.content);

  return (
    <div className="mx-4 mb-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
        {safeContent}
      </p>
    </div>
  );
}
