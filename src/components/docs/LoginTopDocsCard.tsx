import { BookOpen, Check, X } from 'lucide-react';
import { useDocs } from '../../context/DocsContext';
import { DOCS_THEME_STYLES, MALAYALAM_DOCS } from '../../data/malayalamDocs';

export function LoginTopDocsCard() {
  const { isOpen, openPageKey, presentationMode, closeDocs } = useDocs();

  if (!isOpen || openPageKey !== 'login' || presentationMode !== 'inline-top') {
    return null;
  }

  const doc = MALAYALAM_DOCS.login;
  const styles = DOCS_THEME_STYLES.plum;

  return (
    <section
      aria-label="ലോഗിൻ സഹായം"
      className={`w-full max-w-[430px] mb-5 rounded-3xl p-4 sm:p-5 ${styles.cardSurface} ${styles.cardBorderShadow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-2xl ${styles.iconBadge} flex items-center justify-center shrink-0 mt-0.5 shadow-xs`}
          >
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2
              className={`font-ml text-sm sm:text-base font-bold ${styles.headingText}`}
            >
              {doc.title}
            </h2>
            <p className={`font-ml text-xs mt-0.5 ${styles.bodyText}`}>
              {doc.intro}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={closeDocs}
          aria-label="ലോഗിൻ ഗൈഡ് അടയ്ക്കുക"
          className={`p-1.5 rounded-full transition-colors shrink-0 -mr-1 -mt-1 ${styles.closeButton}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {doc.points.map((point) => {
          const Icon = point.icon;
          return (
            <li
              key={point.title}
              className={`rounded-2xl px-3 py-2 flex items-start gap-2.5 ${styles.rowSurface}`}
            >
              <span
                className={`w-7 h-7 rounded-xl ${styles.rowIconBadge} flex items-center justify-center shrink-0 mt-0.5`}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <p
                  className={`font-ml text-xs font-bold ${styles.headingText}`}
                >
                  {point.title}
                </p>
                <p className={`font-ml text-[11px] sm:text-xs ${styles.bodyText}`}>
                  {point.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3.5 flex justify-end">
        <button
          type="button"
          onClick={closeDocs}
          className={`px-4 py-1.5 rounded-xl font-ml text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${styles.primaryButton}`}
        >
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>മനസ്സിലായി</span>
        </button>
      </div>
    </section>
  );
}
