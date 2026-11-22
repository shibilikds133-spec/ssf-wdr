import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X } from 'lucide-react';
import type { ReportPortalRole } from '../../utils/reports';

export const CAMPAIGN_MIN_DATE = '2026-11-22';
export const CAMPAIGN_MAX_DATE = '2026-12-20';

type CampaignMonthKey = '2026-11' | '2026-12';

interface MonthMeta {
  key: CampaignMonthKey;
  year: number;
  monthIndex: number; // 0-based (10 = Nov, 11 = Dec)
  label: string;
  daysInMonth: number;
  minSelectableDay: number;
  maxSelectableDay: number;
}

const CAMPAIGN_MONTHS: Record<CampaignMonthKey, MonthMeta> = {
  '2026-11': {
    key: '2026-11',
    year: 2026,
    monthIndex: 10,
    label: 'Nov 2026',
    daysInMonth: 30,
    minSelectableDay: 22,
    maxSelectableDay: 30,
  },
  '2026-12': {
    key: '2026-12',
    year: 2026,
    monthIndex: 11,
    label: 'Dec 2026',
    daysInMonth: 31,
    minSelectableDay: 1,
    maxSelectableDay: 20,
  },
};

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

interface PickerTheme {
  trigger: string;
  triggerIcon: string;
  triggerPlaceholder: string;
  popoverSurface: string;
  pillTrack: string;
  pillActive: string;
  pillIdle: string;
  weekdayText: string;
  dayEnabled: string;
  daySelected: string;
  dayInRange: string;
  headingText: string;
  mutedText: string;
  dividerBorder: string;
  clearBtn: string;
}

const PICKER_THEMES: Record<ReportPortalRole, PickerTheme> = {
  ADMIN: {
    trigger:
      'border-milk-border bg-white/95 text-plum-950 hover:bg-white focus:outline-none focus:ring-2 focus:ring-plum-900/20 focus:border-plum-900',
    triggerIcon: 'text-plum-900/70',
    triggerPlaceholder: 'text-ink-400',
    popoverSurface:
      'bg-[#FDFBF8]/[0.96] backdrop-blur-xl border border-milk-border shadow-[0_20px_50px_-14px_rgba(33,11,29,0.34)]',
    pillTrack: 'glass-pill',
    pillActive: 'glass-plum text-white shadow-2xs',
    pillIdle: 'text-ink-600 hover:text-plum-950',
    weekdayText: 'text-ink-600',
    dayEnabled: 'text-plum-950 hover:bg-plum-100/80',
    daySelected: 'glass-plum text-white font-bold shadow-xs',
    dayInRange: 'bg-plum-100/75 text-plum-950 font-semibold',
    headingText: 'text-plum-950',
    mutedText: 'text-ink-600',
    dividerBorder: 'border-milk-border',
    clearBtn: 'text-plum-900 hover:bg-plum-100/70',
  },
  SECTOR: {
    trigger:
      'border-leaf-border bg-white/95 text-forest-950 hover:bg-white focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900',
    triggerIcon: 'text-forest-800/75',
    triggerPlaceholder: 'text-forest-600/60',
    popoverSurface:
      'bg-[#F9FCF6]/[0.96] backdrop-blur-xl border border-leaf-border shadow-[0_20px_50px_-14px_rgba(2,28,20,0.32)]',
    pillTrack: 'glass-leaf-pill',
    pillActive: 'glass-forest text-white shadow-2xs',
    pillIdle: 'text-forest-700 hover:text-forest-950',
    weekdayText: 'text-forest-700',
    dayEnabled: 'text-forest-950 hover:bg-forest-100/80',
    daySelected: 'glass-forest text-white font-bold shadow-xs',
    dayInRange: 'bg-forest-100/80 text-forest-950 font-semibold',
    headingText: 'text-forest-950',
    mutedText: 'text-forest-700',
    dividerBorder: 'border-leaf-border',
    clearBtn: 'text-forest-900 hover:bg-forest-100/70',
  },
  UNIT: {
    trigger:
      'border-[#E5DEC9] bg-white/95 text-[#261812] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#EC5E27]/25 focus:border-[#EC5E27]',
    triggerIcon: 'text-[#D44B1A]/80',
    triggerPlaceholder: 'text-[#6B5449]/65',
    popoverSurface:
      'bg-[#FDFBF4]/[0.97] backdrop-blur-xl border border-[#E5DEC9] shadow-[0_20px_50px_-14px_rgba(143,45,13,0.28)]',
    pillTrack: 'glass-cream-pill',
    pillActive: 'glass-orange text-white shadow-2xs',
    pillIdle: 'text-[#6B5449] hover:text-[#261812]',
    weekdayText: 'text-[#6B5449]',
    dayEnabled: 'text-[#261812] hover:bg-[#FFF1EA]',
    daySelected: 'glass-orange text-white font-bold shadow-xs',
    dayInRange: 'bg-[#FFF1EA] text-[#261812] font-semibold',
    headingText: 'text-[#261812]',
    mutedText: 'text-[#6B5449]',
    dividerBorder: 'border-[#E5DEC9]',
    clearBtn: 'text-[#C94514] hover:bg-[#FFF1EA]',
  },
};

function formatDisplayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return '';
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const mLabel = monthNames[monthIdx] ?? '';
  if (!mLabel) return iso;
  return `${String(day).padStart(2, '0')} ${mLabel} ${year}`;
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function resolveInitialMonth(value: string): CampaignMonthKey {
  if (value.startsWith('2026-12')) return '2026-12';
  if (value.startsWith('2026-11')) return '2026-11';
  const nowIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (nowIso >= '2026-12-01' && nowIso <= CAMPAIGN_MAX_DATE) {
    return '2026-12';
  }
  return '2026-11';
}

export interface CampaignDatePickerProps {
  id?: string;
  role: ReportPortalRole;
  value: string;
  onChange: (nextIsoDate: string) => void;
  rangeStart?: string;
  rangeEnd?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export function CampaignDatePicker({
  id,
  role,
  value,
  onChange,
  rangeStart,
  rangeEnd,
  placeholder = 'Select Date',
  ariaLabel = 'Select campaign date',
}: CampaignDatePickerProps) {
  const theme = PICKER_THEMES[role];
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeMonth, setActiveMonth] = useState<CampaignMonthKey>(() =>
    resolveInitialMonth(value)
  );
  const [desktopPos, setDesktopPos] = useState<{
    top: number;
    left: number;
    isMobile: boolean;
  }>({ top: 0, left: 0, isMobile: false });

  useEffect(() => {
    if (open) {
      setActiveMonth(resolveInitialMonth(value));
    }
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 640) {
        setDesktopPos({ top: 0, left: 0, isMobile: true });
        return;
      }

      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popoverW = 280;
      const popoverH = 318;
      const pad = 12;

      let left = rect.left;
      if (left + popoverW > vw - pad) {
        left = Math.max(pad, vw - popoverW - pad);
      }
      if (left < pad) left = pad;

      let top = rect.bottom + 6;
      if (top + popoverH > vh - pad) {
        top = Math.max(pad, rect.top - popoverH - 6);
      }

      setDesktopPos({ top, left, isMobile: false });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, {
      passive: true,
    });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const monthMeta = CAMPAIGN_MONTHS[activeMonth];

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(
      Date.UTC(monthMeta.year, monthMeta.monthIndex, 1)
    ).getUTCDay();
    const cells: Array<{
      day: number | null;
      iso: string;
      enabled: boolean;
    }> = [];

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ day: null, iso: `empty-${i}`, enabled: false });
    }
    for (let day = 1; day <= monthMeta.daysInMonth; day += 1) {
      const iso = toIsoDate(monthMeta.year, monthMeta.monthIndex, day);
      const enabled =
        day >= monthMeta.minSelectableDay && day <= monthMeta.maxSelectableDay;
      cells.push({ day, iso, enabled });
    }
    return cells;
  }, [monthMeta]);

  const displayLabel = value ? formatDisplayDate(value) : '';

  const normalizedRange = useMemo(() => {
    const start = (rangeStart ?? '').trim();
    const end = (rangeEnd ?? '').trim();
    if (!start || !end) return { start: '', end: '' };
    return start <= end ? { start, end } : { start: end, end: start };
  }, [rangeStart, rangeEnd]);

  const handleSelectDay = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const popoverBody = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Campaign date picker (22 Nov – 20 Dec 2026)"
      className={`w-[280px] max-w-[calc(100vw-2rem)] rounded-2xl p-3.5 ${theme.popoverSurface}`}
      style={
        desktopPos.isMobile
          ? undefined
          : {
              position: 'fixed',
              top: `${desktopPos.top}px`,
              left: `${desktopPos.left}px`,
              zIndex: 95,
            }
      }
    >
      {/* Minimal 2-Month Pill Switcher (Nov 2026 | Dec 2026 ONLY) */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div
          className={`flex-1 grid grid-cols-2 gap-1 p-1 rounded-xl ${theme.pillTrack}`}
        >
          {(['2026-11', '2026-12'] as const).map((mKey) => {
            const m = CAMPAIGN_MONTHS[mKey];
            const isActive = activeMonth === mKey;
            return (
              <button
                key={mKey}
                type="button"
                onClick={() => setActiveMonth(mKey)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  isActive ? theme.pillActive : theme.pillIdle
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close calendar"
          className={`p-1.5 rounded-lg transition-colors ${theme.mutedText} hover:bg-black/5`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((dayLabel) => (
          <div
            key={dayLabel}
            className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${theme.weekdayText}`}
          >
            {dayLabel}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell) => {
          if (cell.day === null) {
            return <div key={cell.iso} className="h-8" aria-hidden="true" />;
          }

          if (!cell.enabled) {
            return (
              <button
                key={cell.iso}
                type="button"
                disabled
                tabIndex={-1}
                aria-disabled="true"
                className="h-8 w-full rounded-lg text-xs num font-medium opacity-25 pointer-events-none select-none flex items-center justify-center"
              >
                {cell.day}
              </button>
            );
          }

          const isSelected = value === cell.iso;
          const isInRange =
            !isSelected &&
            Boolean(normalizedRange.start) &&
            Boolean(normalizedRange.end) &&
            cell.iso >= normalizedRange.start &&
            cell.iso <= normalizedRange.end;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => handleSelectDay(cell.iso)}
              aria-pressed={isSelected}
              className={`h-8 w-full rounded-lg text-xs num transition-all flex items-center justify-center ${
                isSelected
                  ? theme.daySelected
                  : isInRange
                  ? theme.dayInRange
                  : `font-medium ${theme.dayEnabled}`
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Minimal Footer */}
      <div
        className={`mt-3 pt-2 border-t ${theme.dividerBorder} flex items-center justify-between gap-2`}
      >
        <span className={`text-[10px] font-semibold num ${theme.mutedText}`}>
          22 Nov – 20 Dec 2026
        </span>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${theme.clearBtn}`}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full px-2.5 py-2 text-xs rounded-xl border flex items-center justify-between gap-2 transition-colors ${theme.trigger}`}
      >
        <span
          className={`truncate num font-semibold ${
            displayLabel ? '' : `font-medium ${theme.triggerPlaceholder}`
          }`}
        >
          {displayLabel || placeholder}
        </span>
        <Calendar className={`w-3.5 h-3.5 shrink-0 ${theme.triggerIcon}`} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          desktopPos.isMobile ? (
            <div
              className="fixed inset-0 z-[95] bg-black/25 backdrop-blur-[2px] flex items-center justify-center pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              {popoverBody}
            </div>
          ) : (
            popoverBody
          ),
          document.body
        )}
    </>
  );
}

export default CampaignDatePicker;
