'use client';

/**
 * @module providers
 * @description Root client-side provider tree for the application. Composes NextAuth
 * SessionProvider, TanStack QueryClientProvider, RealtimeProvider, and ToastProvider
 * into a single wrapper component used at the layout level.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, type ReactNode } from 'react';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { ToastProvider } from '@/contexts/ToastContext';

/**
 * @description Root provider component that wraps children with all necessary context
 * providers: NextAuth session, TanStack Query (with 1-minute stale time and no
 * window-focus refetch), real-time Pusher context, and toast notification context.
 * @param children - The React node tree to render inside the provider stack.
 * @returns The provider-wrapped React tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </RealtimeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

