import React, { useEffect, useState } from 'react';
import { SsfLogo } from './SsfLogo';
import { BrandText } from './BrandText';

interface BrandLoadingScreenProps {
  message?: string;
  minDurationMs?: number;
  onReady?: () => void;
}

export const BrandLoadingScreen: React.FC<BrandLoadingScreenProps> = ({
  message = 'Loading...',
  minDurationMs = 0,
  onReady,
}) => {
  const [, setReady] = useState(minDurationMs <= 0);

  useEffect(() => {
    if (minDurationMs > 0) {
      const timer = setTimeout(() => {
        setReady(true);
        onReady?.();
      }, minDurationMs);
      return () => clearTimeout(timer);
    }
  }, [minDurationMs, onReady]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 gap-4">
      <SsfLogo animated className="w-16 h-auto drop-shadow-md" />
      {message && (
        <div className="text-center">
          <p className="text-xs font-bold text-plum-900 tracking-wide uppercase">
            {message}
          </p>
          <p className="text-[11px] text-ink-600 mt-0.5">
            <BrandText text="SSF Wandoor Division" />
          </p>
        </div>
      )}
    </div>
  );
};
