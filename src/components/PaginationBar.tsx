import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PaginationTheme = 'admin' | 'sector' | 'unit' | 'public';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: number) => void;
  pageSizeOptions?: number[];
  theme: PaginationTheme;
  loading?: boolean;
  isDesktop: boolean;
  locale?: 'en' | 'ml';
  unitLabelMl?: string;
}

const THEME_STYLES: Record<
  PaginationTheme,
  {
    container: string;
    primaryText: string;
    mutedText: string;
    buttonIdle: string;
    buttonActive: string;
    pillTrack: string;
    pillIdle: string;
    pillActive: string;
  }
> = {
  admin: {
    container: 'glass-card border border-milk-border/80',
    primaryText: 'text-plum-900',
    mutedText: 'text-ink-600',
    buttonIdle:
      'border border-milk-border bg-white/90 text-plum-900 hover:bg-milk-100',
    buttonActive: 'glass-plum text-white border border-transparent shadow-xs',
    pillTrack: 'glass-pill',
    pillIdle: 'text-ink-600 hover:text-plum-900',
    pillActive: 'glass-plum text-white shadow-2xs',
  },
  sector: {
    container: 'glass-leaf-card border border-leaf-border/80',
    primaryText: 'text-forest-950',
    mutedText: 'text-forest-600',
    buttonIdle:
      'border border-leaf-border bg-white/90 text-forest-900 hover:bg-leaf-100',
    buttonActive: 'glass-forest text-white border border-transparent shadow-xs',
    pillTrack: 'glass-leaf-pill',
    pillIdle: 'text-forest-600 hover:text-forest-950',
    pillActive: 'glass-forest text-white shadow-2xs',
  },
  unit: {
    container: 'glass-cream-card border border-[#E5DEC9]',
    primaryText: 'text-[#261812]',
    mutedText: 'text-[#6B5449]',
    buttonIdle:
      'border border-[#E5DEC9] bg-white/90 text-[#261812] hover:bg-[#FBF8EE]',
    buttonActive: 'glass-orange text-white border border-transparent shadow-xs',
    pillTrack: 'glass-cream-pill',
    pillIdle: 'text-[#6B5449] hover:text-[#261812]',
    pillActive: 'glass-orange text-white shadow-2xs',
  },
  public: {
    container:
      'bg-white/75 backdrop-blur-xl border border-[#5C0A0E]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_4px_14px_-6px_rgba(92,10,14,0.08)]',
    primaryText: 'text-[#2B0406]',
    mutedText: 'text-[#7A2E33]',
    buttonIdle:
      'border border-[#5C0A0E]/18 bg-white/90 text-[#4A070A] hover:bg-white',
    buttonActive: 'glass-crimson text-white border border-transparent shadow-xs',
    pillTrack: 'glass-rose-pill',
    pillIdle: 'text-[#7A2E33] hover:text-[#2B0406]',
    pillActive: 'glass-crimson text-white shadow-2xs',
  },
};

function buildPageTokens(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const tokens: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) {
    tokens.push('ellipsis');
  }
  for (let p = left; p <= right; p += 1) {
    tokens.push(p);
  }
  if (right < totalPages - 1) {
    tokens.push('ellipsis');
  }
  tokens.push(totalPages);

  return tokens;
}

export function PaginationBar({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50],
  theme,
  loading = false,
  isDesktop,
  locale,
  unitLabelMl = 'യൂണിറ്റുകൾ',
}: PaginationBarProps) {
  if (totalCount <= 0) {
    return null;
  }

  const isMl = locale === 'ml' || (!locale && theme === 'public');
  const styles = THEME_STYLES[theme];
  const safeTotalPages = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const startRow = (safePage - 1) * pageSize + 1;
  const endRow = Math.min(safePage * pageSize, totalCount);
  const pageTokens = buildPageTokens(safePage, safeTotalPages);

  const canGoPrev = safePage > 1 && !loading;
  const canGoNext = safePage < safeTotalPages && !loading;

  if (!isDesktop) {
    return (
      <div
        className={`${styles.container} rounded-2xl p-3 space-y-2.5`}
        aria-label="Pagination"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] num">
          {isMl ? (
            <span className={`font-ml ${styles.mutedText}`}>
              <strong className={styles.primaryText}>
                {startRow}–{endRow}
              </strong>{' '}
              / <strong className={styles.primaryText}>{totalCount}</strong>{' '}
              {unitLabelMl}
            </span>
          ) : (
            <span className={styles.mutedText}>
              Showing{' '}
              <strong className={styles.primaryText}>
                {startRow}–{endRow}
              </strong>{' '}
              of <strong className={styles.primaryText}>{totalCount}</strong>
            </span>
          )}

          {isMl ? (
            <span className={`font-ml font-bold ${styles.primaryText}`}>
              പേജ് {safePage} / {safeTotalPages}
            </span>
          ) : (
            onPageSizeChange && (
              <div className={`${styles.pillTrack} p-0.5 rounded-full inline-flex items-center`}>
                {pageSizeOptions.slice(0, 3).map((sizeOpt) => (
                  <button
                    key={sizeOpt}
                    type="button"
                    disabled={loading}
                    onClick={() => onPageSizeChange(sizeOpt)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors num ${
                      pageSize === sizeOpt ? styles.pillActive : styles.pillIdle
                    }`}
                  >
                    {sizeOpt}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
            className={`${styles.buttonIdle} rounded-xl py-1.5 px-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{isMl ? '‹' : 'Prev'}</span>
          </button>

          <div className="flex items-center justify-center gap-1 overflow-x-auto py-0.5 num">
            {pageTokens.map((token, idx) =>
              token === 'ellipsis' ? (
                <span
                  key={`m-ellipsis-${idx}`}
                  className={`px-1 text-[11px] select-none ${styles.mutedText}`}
                >
                  …
                </span>
              ) : (
                <button
                  key={token}
                  type="button"
                  disabled={loading}
                  onClick={() => onPageChange(token)}
                  aria-current={token === safePage ? 'page' : undefined}
                  className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    token === safePage ? styles.buttonActive : styles.buttonIdle
                  } disabled:cursor-not-allowed`}
                >
                  {token}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
            className={`${styles.buttonIdle} rounded-xl py-1.5 px-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0`}
          >
            <span>{isMl ? '›' : 'Next'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.container} rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap`}
      aria-label="Pagination"
    >
      <div className="flex items-center gap-3 text-xs num">
        {isMl ? (
          <span className={`font-ml ${styles.mutedText}`}>
            പേജ്{' '}
            <strong className={styles.primaryText}>
              {safePage} / {safeTotalPages}
            </strong>{' '}
            ·{' '}
            <strong className={styles.primaryText}>
              {startRow}–{endRow}
            </strong>{' '}
            / <strong className={styles.primaryText}>{totalCount}</strong>{' '}
            {unitLabelMl}
          </span>
        ) : (
          <span className={styles.mutedText}>
            Showing{' '}
            <strong className={styles.primaryText}>
              {startRow}–{endRow}
            </strong>{' '}
            of <strong className={styles.primaryText}>{totalCount}</strong>
          </span>
        )}

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] ${styles.mutedText}`}>Rows:</span>
            <div className={`${styles.pillTrack} p-0.5 rounded-full inline-flex items-center`}>
              {pageSizeOptions.map((sizeOpt) => (
                <button
                  key={sizeOpt}
                  type="button"
                  disabled={loading}
                  onClick={() => onPageSizeChange(sizeOpt)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors num ${
                    pageSize === sizeOpt ? styles.pillActive : styles.pillIdle
                  }`}
                >
                  {sizeOpt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 num">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
          className={`${styles.buttonIdle} rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{isMl ? '‹' : 'Prev'}</span>
        </button>

        {pageTokens.map((token, idx) =>
          token === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className={`px-1.5 text-xs select-none ${styles.mutedText}`}
            >
              …
            </span>
          ) : (
            <button
              key={token}
              type="button"
              disabled={loading}
              onClick={() => onPageChange(token)}
              aria-current={token === safePage ? 'page' : undefined}
              className={`min-w-[30px] h-[30px] px-2 rounded-lg text-xs font-semibold transition-colors ${
                token === safePage ? styles.buttonActive : styles.buttonIdle
              } disabled:cursor-not-allowed`}
            >
              {token}
            </button>
          )
        )}

        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
          className={`${styles.buttonIdle} rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
        >
          <span>{isMl ? '›' : 'Next'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
