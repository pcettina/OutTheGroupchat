/**
 * @module app/heatmap
 * @description V1 Phase 4 — Journey D heatmap landing page.
 *
 * Auth-gated by `src/middleware.ts`. Server component shell that hosts the
 * client-only `HeatmapView` (which dynamically imports maplibre-gl, a
 * browser-only library).
 */

import type { Metadata } from 'next';
import { HeatmapView } from '@/components/heatmap/HeatmapView';

export const metadata: Metadata = {
  title: 'Heatmap · OutTheGroupchat',
  description: 'See where your Crew is interested in being and where they actually are.',
};

export default function HeatmapPage() {
  return (
    <main className="pt-20 pb-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-otg-text-bright">Heatmap</h1>
        <p className="text-sm text-otg-text-dim">
          Anonymized density of where your Crew wants to be (Interest) and where they actually are (Presence).
        </p>
      </header>

      <div className="h-[calc(100vh-200px)] min-h-[520px]">
        <HeatmapView />
      </div>
    </main>
  );
}
