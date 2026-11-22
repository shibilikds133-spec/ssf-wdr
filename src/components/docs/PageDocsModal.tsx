import { useEffect } from 'react';
import { BookOpen, Check, Sparkles, X } from 'lucide-react';
import { useDocs } from '../../context/DocsContext';
import { DOCS_THEME_STYLES, MALAYALAM_DOCS } from '../../data/malayalamDocs';

export function PageDocsModal() {
  const {
    isOpen,
    openPageKey,
    activePageKey,
    activeTheme,
    presentationMode,
    closeDocs,
  } = useDocs();

  const docKey = openPageKey ?? activePageKey;
  const activeDoc = docKey ? MALAYALAM_DOCS[docKey] : null;
  const visible = isOpen && Boolean(activeDoc) && presentationMode === 'modal';

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDocs();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, closeDocs]);

  if (!visible || !activeDoc) {
    return null;
  }

  const styles = DOCS_THEME_STYLES[activeTheme];

  return (
    <div
      className={`fixed inset-0 z-[70] ${styles.backdrop} flex items-center justify-center pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-docs-modal-title"
      onClick={closeDocs}
    >
      <div
        className={`w-full max-w-lg max-h-[82dvh] flex flex-col rounded-3xl overflow-hidden ${styles.cardSurface} ${styles.cardBorderShadow}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles.portalBadge}`}
            >
              <BookOpen className="w-3 h-3 shrink-0" />
              <span>{activeDoc.portalLabel}</span>
            </span>

            <button
              type="button"
              onClick={closeDocs}
              aria-label="Close docs"
              className={`p-1.5 rounded-full transition-colors ${styles.closeButton}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl ${styles.iconBadge} flex items-center justify-center shrink-0 mt-0.5 shadow-xs`}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="page-docs-modal-title"
                className={`font-ml text-base sm:text-lg font-bold ${styles.headingText}`}
              >
                {activeDoc.title}
              </h2>
              <p className={`font-ml text-xs sm:text-sm mt-1 ${styles.bodyText}`}>
                {activeDoc.intro}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Feature Cards */}
        <div className="px-5 py-2 overflow-y-auto flex-1 space-y-2.5">
          {activeDoc.points.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className={`rounded-2xl p-3 flex items-start gap-3 ${styles.rowSurface}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl ${styles.rowIconBadge} flex items-center justify-center shrink-0 mt-0.5`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    className={`font-ml text-xs sm:text-sm font-bold ${styles.headingText}`}
                  >
                    {point.title}
                  </h3>
                  <p
                    className={`font-ml text-xs sm:text-[13px] mt-0.5 ${styles.bodyText}`}
                  >
                    {point.description}
                  </p>
                </div>
              </div>
            );
          })}

          {activeDoc.tip && (
            <div
              className={`rounded-2xl px-3.5 py-2.5 flex items-start gap-2.5 ${styles.tipStrip}`}
            >
              <Sparkles className="w-4 h-4 shrink-0 mt-1" />
              <p className="font-ml text-xs font-medium">{activeDoc.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-5 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={closeDocs}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-ml text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors ${styles.primaryButton}`}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>മനസ്സിലായി</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PageDocsModal;
