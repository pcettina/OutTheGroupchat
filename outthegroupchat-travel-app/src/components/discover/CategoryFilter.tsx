'use client';

import { motion } from 'framer-motion';

interface Category {
  id: string;
  label: string;
  icon: string;
  count?: number;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  className?: string;
}

const defaultCategories: Category[] = [
  { id: 'all', label: 'All', icon: '🌍' },
  { id: 'beach', label: 'Beach', icon: '🏖️' },
  { id: 'city', label: 'City', icon: '🏙️' },
  { id: 'adventure', label: 'Adventure', icon: '🏔️' },
  { id: 'culture', label: 'Culture', icon: '🏛️' },
  { id: 'nightlife', label: 'Nightlife', icon: '🌙' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'nature', label: 'Nature', icon: '🌲' },
  { id: 'wellness', label: 'Wellness', icon: '🧘' },
];

export function CategoryFilter({
  categories = defaultCategories,
  selectedCategory,
  onSelectCategory,
  className = '',
}: CategoryFilterProps) {
  const activeCategory = selectedCategory || 'all';

  return (
    <div className={`relative ${className}`}>
      {/* Scrollable Container */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <motion.button
              key={category.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectCategory(category.id === 'all' ? null : category.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <span className="text-lg">{category.icon}</span>
              <span className="text-sm font-medium">{category.label}</span>
              {category.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>
                  {category.count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Gradient Fades */}
      <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-white dark:from-slate-900 to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none" />
    </div>
  );
}

export default CategoryFilter;
