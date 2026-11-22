import React from 'react';
import { BrandText } from './BrandText';
import { SsfLogo } from './SsfLogo';

interface AppLoaderProps {
  fullScreen?: boolean;
  message?: string;
}

export const AppLoader: React.FC<AppLoaderProps> = ({
  fullScreen = false,
  message = 'Loading...',
}) => {
  return (
    <div
      className={`${
        fullScreen ? 'min-h-[100dvh] bg-transparent' : 'min-h-[60vh]'
      } flex flex-col items-center justify-center p-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] gap-4`}
    >
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
