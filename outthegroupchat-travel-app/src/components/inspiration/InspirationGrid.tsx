'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { Template } from './types';

interface TemplateCardProps {
  template: Template;
  index: number;
}

function TemplateCard({ template, index }: TemplateCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer border border-slate-200 dark:border-slate-700"
    >
      <div className="relative h-48 overflow-hidden">
        <Image
          src={template.image}
          alt={template.title}
          fill
          style={{ objectFit: 'cover' }}
          className="group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {template.rating}
            </span>
            <span>•</span>
            <span>{template.usageCount} trips</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          {template.title}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>{template.duration} days</span>
          <span>
            ${template.estimatedBudget.min}-${template.estimatedBudget.max}/person
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface InspirationGridProps {
  templates: Template[];
  isLoading: boolean;
  clearFilters: () => void;
}

export function InspirationGrid({ templates, isLoading, clearFilters }: InspirationGridProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mb-16"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🔥</span> Trip Templates
        </h2>
        <span className="text-sm text-slate-500">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-lg animate-pulse">
              <div className="h-48 bg-slate-200 dark:bg-slate-700" />
              <div className="p-5">
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template, index) => (
            <TemplateCard key={template.id} template={template} index={index} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-slate-500 dark:text-slate-400">
            No templates match your filters. Try adjusting your search.
          </p>
          <button
            onClick={clearFilters}
            className="mt-4 text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </motion.section>
  );
}
