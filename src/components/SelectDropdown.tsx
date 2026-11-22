import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption =
    selectedIndex >= 0 ? options[selectedIndex] : options[0];

  useEffect(() => {
    if (!open) return;

    const handleOutsideMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
    };
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const selectOption = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (options.length === 0) return;

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      } else {
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setHighlightedIndex(
          selectedIndex >= 0 ? selectedIndex : options.length - 1
        );
        setOpen(true);
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : options.length - 1
        );
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      } else if (
        highlightedIndex >= 0 &&
        highlightedIndex < options.length
      ) {
        selectOption(options[highlightedIndex].value);
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-2 text-sm rounded-xl border inline-flex items-center justify-between gap-2 transition-[background-color,border-color,box-shadow,color] focus:outline-none focus:ring-2 focus:ring-plum-900/20 focus:border-plum-900 ${
          open
            ? 'border-plum-900 ring-2 ring-plum-900/20 bg-white text-ink-900'
            : 'border-milk-border bg-white/90 hover:bg-white text-ink-900'
        }`}
      >
        <span className="truncate text-left">
          {selectedOption?.label ?? ''}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 text-ink-600 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-plum-900' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 mt-1.5 w-full md:w-max md:min-w-full md:max-w-[260px] max-h-60 overflow-y-auto glass-card bg-white/95 rounded-xl border border-milk-border shadow-xl py-1 z-40"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt.value);
                }}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-plum-100/80 text-plum-900 font-semibold'
                    : isHighlighted
                      ? 'bg-milk-100/80 text-ink-900'
                      : 'text-ink-900 hover:bg-milk-100/80'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-plum-900 shrink-0"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
