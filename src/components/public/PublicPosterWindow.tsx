import { memo, useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PublicPosterWindowProps {
  className?: string;
}

export const PublicPosterWindow = memo(function PublicPosterWindow({
  className = '',
}: PublicPosterWindowProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (!zoomOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomOpen]);

  return (
    <>
      <div
        className={`relative group rounded-2xl sm:rounded-3xl overflow-hidden border border-[#5C0A0E]/20 bg-[#5C0A0E] shadow-[0_14px_34px_-10px_rgba(92,10,14,0.34)] ${className}`}
      >
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="പോസ്റ്റർ വലുതായി കാണുക"
          className="block w-full text-left relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCE36D]"
        >
          <div className="w-full aspect-[1200/531] overflow-hidden bg-[#5C0A0E]">
            <picture>
              <source
                srcSet="/poster-banner-sm.webp 720w, /poster-banner.webp 1200w"
                sizes="(max-width: 768px) 100vw, 1152px"
                type="image/webp"
              />
              <img
                src="/poster-banner.jpg"
                alt="SSF വണ്ടൂർ ഡിവിഷൻ പാലട പായസം ചലഞ്ച് പോസ്റ്റർ"
                width={1200}
                height={531}
                decoding="async"
                fetchPriority="high"
                className="w-full h-full object-cover select-none"
              />
            </picture>
          </div>
        </button>
      </div>

      {zoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Promotional Poster Preview"
          className="fixed inset-0 z-[75] bg-[#1E0305]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setZoomOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl rounded-2xl sm:rounded-3xl overflow-hidden border border-[#FCE36D]/30 bg-[#4A070A] shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              aria-label="ക്ലോസ് ചെയ്യുക"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 text-white border border-white/25 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-full aspect-[1200/531]">
              <picture>
                <source srcSet="/poster-banner.webp" type="image/webp" />
                <img
                  src="/poster-banner.jpg"
                  alt="SSF വണ്ടൂർ ഡിവിഷൻ പാലട പായസം ചലഞ്ച്"
                  width={1200}
                  height={531}
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </picture>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default PublicPosterWindow;
