'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface DestinationCardProps {
  id: string;
  city: string;
  country: string;
  image?: string;
  averagePrice?: number;
  rating?: number;
  tripCount?: number;
  tags?: string[];
  featured?: boolean;
}

export function DestinationCard({
  id,
  city,
  country,
  image,
  averagePrice,
  rating,
  tripCount,
  tags = [],
  featured = false,
}: DestinationCardProps) {
  return (
    <Link href={`/discover/${id}`}>
      <motion.div
        whileHover={{ y: -8, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`relative group rounded-2xl overflow-hidden ${
          featured ? 'col-span-2 row-span-2 aspect-square' : 'aspect-[4/5]'
        }`}
      >
        {/* Background Image */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-500">
          {image && (
            <img
              src={image}
              alt={`${city}, ${country}`}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          )}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Featured Badge */}
        {featured && (
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
              <span>⭐</span> Featured
            </span>
          </div>
        )}

        {/* Rating */}
        {rating && (
          <div className="absolute top-4 right-4">
            <span className="px-2 py-1 bg-white/90 backdrop-blur-sm text-slate-900 text-sm font-semibold rounded-full flex items-center gap-1">
              <span>⭐</span> {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <h3 className={`text-white font-bold mb-1 ${featured ? 'text-2xl md:text-3xl' : 'text-xl'}`}>
            {city}
          </h3>
          <p className="text-white/80 text-sm mb-3">{country}</p>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.slice(0, featured ? 4 : 2).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-white/90 text-sm">
            {averagePrice && (
              <span className="flex items-center gap-1">
                <span>💰</span>
                <span>~${averagePrice}/trip</span>
              </span>
            )}
            {tripCount && (
              <span className="flex items-center gap-1">
                <span>✈️</span>
                <span>{tripCount} trips</span>
              </span>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </motion.div>
    </Link>
  );
}

export default DestinationCard;
