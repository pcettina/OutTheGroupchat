'use client';

import { useState } from 'react';
import { SubCrewCard } from './SubCrewCard';
import { ImInButton } from './ImInButton';
import type { SubCrewResponse } from '@/types/subcrew';

interface EmergingSubCrewCardProps {
  subCrew: SubCrewResponse;
  onJoined?: (subCrewId: string) => void;
}

/**
 * SubCrew card with the "I'm in" CTA — used in the feed when a SubCrew has
 * formed around someone in the caller's Crew that they could join.
 */
export function EmergingSubCrewCard({ subCrew, onJoined }: EmergingSubCrewCardProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <SubCrewCard
      subCrew={subCrew}
      linkToDetail={false}
      cta={
        <ImInButton
          subCrewId={subCrew.id}
          onJoined={() => {
            setHidden(true);
            onJoined?.(subCrew.id);
          }}
        />
      }
    />
  );
}
