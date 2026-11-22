import { BookOpen } from 'lucide-react';
import { useDocs } from '../../context/DocsContext';
import {
  DOCS_THEME_STYLES,
  type DocPageKey,
  type DocsPortalTheme,
} from '../../utils/docsConfig';

interface PageDocsButtonProps {
  theme: DocsPortalTheme;
  pageKey?: DocPageKey;
  action?: 'open' | 'toggle';
  labelBreakpoint?: 'sm' | 'xl';
  className?: string;
}

export function PageDocsButton({
  theme,
  pageKey,
  action = 'open',
  labelBreakpoint = 'sm',
  className = '',
}: PageDocsButtonProps) {
  const { openDocs, toggleDocs, isOpen, openPageKey, activePageKey } = useDocs();
  const styles = DOCS_THEME_STYLES[theme];

  const targetKey = pageKey ?? activePageKey ?? undefined;
  const isPressed = isOpen && (!targetKey || openPageKey === targetKey);

  const handleClick = () => {
    if (action === 'toggle') {
      toggleDocs(pageKey);
    } else {
      openDocs(pageKey);
    }
  };

  const sizeClass =
    labelBreakpoint === 'xl'
      ? 'w-9 xl:w-auto xl:px-3'
      : 'w-9 sm:w-auto sm:px-3';

  const labelClass =
    labelBreakpoint === 'xl' ? 'hidden xl:inline' : 'hidden sm:inline';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="പേജ് ഗൈഡ് (ഡോക്സ്)"
      aria-expanded={isPressed}
      title="ഡോക്സ്"
      className={`h-9 ${sizeClass} rounded-full ${styles.triggerButton} inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors ${className}`}
    >
      <BookOpen className="w-4 h-4 shrink-0" />
      <span
        className={`${labelClass} font-ml text-xs font-semibold leading-none whitespace-nowrap`}
      >
        ഡോക്സ്
      </span>
    </button>
  );
}
