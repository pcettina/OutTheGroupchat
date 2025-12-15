'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { FeedItem, CommentThread, ShareModal } from '@/components/feed';

type FeedType = 'all' | 'following' | 'trending';

interface FeedItemData {
  id: string;
  type: 'trip_created' | 'trip_completed' | 'activity_added' | 'member_joined' | 'review_posted' | 'trip_in_progress';
  timestamp: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  trip?: {
    id: string;
    title: string;
    destination: { city: string; country: string };
    status: string;
  };
  activity?: {
    id: string;
    name: string;
    category: string;
    description: string | null;
  };
  metadata?: {
    memberCount?: number;
    activityCount?: number;
    saveCount?: number;
    commentCount?: number;
    rating?: number;
  };
  isSaved?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function FeedPage() {
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [feedItems, setFeedItems] = useState<FeedItemData[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [commentModal, setCommentModal] = useState<{
    isOpen: boolean;
    itemId: string;
    itemType: 'trip' | 'activity';
  }>({ isOpen: false, itemId: '', itemType: 'activity' });

  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    data: {
      id: string;
      type: 'trip' | 'activity';
      title: string;
      description?: string;
      destination?: string;
      imageUrl?: string;
    } | null;
  }>({ isOpen: false, data: null });

  const fetchFeed = useCallback(async (page = 1, append = false) => {
    if (page === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const res = await fetch(`/api/feed?type=${feedType}&page=${page}&limit=15`);
      if (!res.ok) throw new Error('Failed to fetch feed');
      
      const data = await res.json();
      
      if (data.success) {
        setFeedItems(prev => append ? [...prev, ...data.data] : data.data);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [feedType]);

  useEffect(() => {
    fetchFeed(1, false);
  }, [feedType, fetchFeed]);

  const loadMore = () => {
    if (pagination && pagination.hasMore && !isLoadingMore) {
      fetchFeed(pagination.page + 1, true);
    }
  };

  const handleSave = (activityId: string, action: 'save' | 'unsave') => {
    setFeedItems(prev => prev.map(item => 
      item.activity?.id === activityId 
        ? { ...item, isSaved: action === 'save' }
        : item
    ));
  };

  const handleComment = (itemId: string, itemType: 'trip' | 'activity') => {
    setCommentModal({ isOpen: true, itemId, itemType });
  };

  const handleShare = (itemId: string, itemType: 'trip' | 'activity') => {
    // Find the item in feed to get its details
    const item = feedItems.find(i => {
      if (itemType === 'activity') return i.activity?.id === itemId;
      return i.trip?.id === itemId;
    });

    if (!item) return;

    const shareData = {
      id: itemId,
      type: itemType,
      title: itemType === 'trip' 
        ? item.trip?.title || 'Trip' 
        : item.activity?.name || 'Activity',
      description: item.activity?.description || undefined,
      destination: item.trip?.destination 
        ? `${item.trip.destination.city}, ${item.trip.destination.country}` 
        : undefined,
      imageUrl: undefined, // Can be enhanced with actual images
    };

    setShareModal({ isOpen: true, data: shareData });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      
      <main className="pt-20 pb-16">
        <div className="max-w-2xl mx-auto px-4">
          
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Activity Feed</h1>
            <p className="text-slate-500 dark:text-slate-400">See what the community is planning</p>
          </motion.div>

          {/* Feed Type Tabs */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {[
                { value: 'all' as FeedType, label: 'For You' },
                { value: 'following' as FeedType, label: 'Following' },
                { value: 'trending' as FeedType, label: 'Trending' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFeedType(tab.value)}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    feedType === tab.value
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Feed Content */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 animate-pulse border border-slate-200 dark:border-slate-700">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                      <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : feedItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
            >
              <span className="text-6xl mb-4 block">
                {feedType === 'following' ? '👥' : '📭'}
              </span>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                {feedType === 'following' 
                  ? 'Follow some travelers!' 
                  : 'No activity yet'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {feedType === 'following'
                  ? 'Follow other users to see their trip updates in your feed.'
                  : 'When people share their trips and activities, they\'ll show up here.'}
              </p>
              {feedType === 'following' && (
                <a
                  href="/inspiration"
                  className="inline-block mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full font-medium hover:bg-emerald-600 transition-colors"
                >
                  Discover Travelers
                </a>
              )}
            </motion.div>
          ) : (
            <>
              <div className="space-y-4">
                {feedItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.3) }}
                  >
                    <FeedItem
                      {...item}
                      onSave={handleSave}
                      onComment={handleComment}
                      onShare={handleShare}
                    />
                  </motion.div>
                ))}
              </div>

              {/* Load More */}
              {pagination?.hasMore && (
                <div className="mt-8 text-center">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading...
                      </span>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Create CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="fixed bottom-6 right-6"
          >
            <a
              href="/trips/new"
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Plan a Trip
            </a>
          </motion.div>
        </div>
      </main>

      {/* Comment Thread Modal */}
      <CommentThread
        itemId={commentModal.itemId}
        itemType={commentModal.itemType}
        isOpen={commentModal.isOpen}
        onClose={() => setCommentModal({ ...commentModal, isOpen: false })}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModal.isOpen}
        shareData={shareModal.data}
        onClose={() => setShareModal({ ...shareModal, isOpen: false })}
      />
    </div>
  );
}
