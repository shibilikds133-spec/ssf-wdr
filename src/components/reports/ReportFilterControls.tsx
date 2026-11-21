import { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Layers,
  Lock,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { SectorOption, UnitSummaryRow } from '../../types';
import {
  getAllowedScopes,
  getAllowedTemplates,
  normalizeReportConfig,
  type ReportDataSource,
  type ReportDatePreset,
  type ReportFilterConfig,
  type ReportPortalRole,
  type ReportScopeType,
  type ReportSortBy,
  type ReportTemplateType,
} from '../../utils/reports';
import { BrandText } from '../BrandText';

export interface PortalThemeTokens {
  primaryBtn: string;
  cardSurface: string;
  innerCard: string;
  tableSurface: string;
  tableHead: string;
  pillSurface: string;
  border: string;
  heading: string;
  muted: string;
  accentText: string;
  activeOptionCard: string;
  badgeSoft: string;
  inputFocus: string;
  checkboxAccent: string;
}

export const PORTAL_THEME_TOKENS: Record<ReportPortalRole, PortalThemeTokens> = {
  ADMIN: {
    primaryBtn: 'glass-plum text-white',
    cardSurface: 'glass-card',
    innerCard: 'bg-milk-50/90 border border-milk-border',
    tableSurface: 'glass-table',
    tableHead: 'glass-table-head text-ink-600 border-b border-milk-border',
    pillSurface: 'glass-pill',
    border: 'border-milk-border',
    heading: 'text-plum-900',
    muted: 'text-ink-600',
    accentText: 'text-plum-900',
    activeOptionCard:
      'bg-plum-100/80 border-plum-900/40 text-plum-950 ring-1 ring-plum-900/20',
    badgeSoft: 'bg-plum-100 text-plum-900 border border-plum-200',
    inputFocus:
      'focus:outline-none focus:ring-2 focus:ring-plum-900/20 focus:border-plum-900',
    checkboxAccent: 'accent-[#381932]',
  },
  SECTOR: {
    primaryBtn: 'glass-forest text-white',
    cardSurface: 'glass-leaf-card',
    innerCard: 'bg-leaf-50/90 border border-leaf-border',
    tableSurface: 'glass-leaf-table',
    tableHead: 'glass-leaf-head text-forest-700 border-b border-leaf-border',
    pillSurface: 'glass-leaf-pill',
    border: 'border-leaf-border',
    heading: 'text-forest-950',
    muted: 'text-forest-600',
    accentText: 'text-forest-900',
    activeOptionCard:
      'bg-forest-100/85 border-forest-900/40 text-forest-950 ring-1 ring-forest-900/20',
    badgeSoft: 'bg-forest-100 text-forest-900 border border-forest-200',
    inputFocus:
      'focus:outline-none focus:ring-2 focus:ring-forest-900/20 focus:border-forest-900',
    checkboxAccent: 'accent-[#043326]',
  },
  UNIT: {
    primaryBtn: 'glass-orange text-white',
    cardSurface: 'glass-cream-card',
    innerCard: 'unit-inner-card',
    tableSurface: 'glass-cream-table',
    tableHead: 'glass-cream-head text-[#6B5449] border-b border-[#E5DEC9]',
    pillSurface: 'glass-cream-pill',
    border: 'border-[#E5DEC9]',
    heading: 'text-[#261812]',
    muted: 'text-[#6B5449]',
    accentText: 'text-[#D44B1A]',
    activeOptionCard:
      'bg-[#FFF1EA] border-[#EC5E27]/60 text-[#261812] ring-1 ring-[#EC5E27]/25',
    badgeSoft: 'bg-[#FFF1EA] text-[#C94514] border border-[#F8CBB6]',
    inputFocus:
      'focus:outline-none focus:ring-2 focus:ring-[#EC5E27]/25 focus:border-[#EC5E27]',
    checkboxAccent: 'accent-[#EC5E27]',
  },
};

interface ScopeMeta {
  title: string;
  description: string;
  icon: typeof Building2;
}

const SCOPE_META: Record<ReportScopeType, ScopeMeta> = {
  ENTIRE_DIVISION: {
    title: 'Entire Division',
    description: 'All sectors, units + direct',
    icon: Building2,
  },
  SECTOR_SPECIFIC: {
    title: 'By Sector',
    description: 'One sector & its units',
    icon: Layers,
  },
  UNIT_SPECIFIC: {
    title: 'By Unit',
    description: 'Pick a single unit',
    icon: MapPin,
  },
  DIVISION_DIRECT: {
    title: 'Division Direct',
    description: 'Orders with no unit',
    icon: ShieldCheck,
  },
  ENTIRE_SECTOR: {
    title: 'Entire Sector',
    description: 'All units in sector',
    icon: Layers,
  },
  THIS_UNIT: {
    title: 'This Unit',
    description: 'Locked to unit',
    icon: MapPin,
  },
};

interface TemplateMeta {
  title: string;
  description: string;
  icon: typeof ClipboardList;
}

const TEMPLATE_META: Record<ReportTemplateType, TemplateMeta> = {
  DETAILED_ORDERS: {
    title: 'Detailed Orders',
    description: 'Customer-level order list',
    icon: ClipboardList,
  },
  DELIVERY_SHEET: {
    title: 'Delivery Sheet',
    description: 'Handover sheet with [ ] ticks',
    icon: PackageCheck,
  },
  SECTOR_SUMMARY: {
    title: 'Sector Summary',
    description: 'Sectors ranked vs limit',
    icon: BarChart3,
  },
  UNIT_SUMMARY: {
    title: 'Unit Summary',
    description: 'Units ranked with splits',
    icon: BarChart3,
  },
  UNPAID_DUES: {
    title: 'Unpaid Dues',
    description: 'Pending collections only',
    icon: Clock,
  },
};

interface ReportFilterControlsProps {
  source: ReportDataSource;
  config: ReportFilterConfig;
  onChange: (nextConfig: ReportFilterConfig) => void;
  compact?: boolean;
}

export function ReportFilterControls({
  source,
  config,
  onChange,
  compact = false,
}: ReportFilterControlsProps) {
  const theme = PORTAL_THEME_TOKENS[source.role];
  const allowedScopes = getAllowedScopes(source.role);
  const allowedTemplates = getAllowedTemplates(source.role, config.scope);

  const [sectorSearch, setSectorSearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [unitSectorPreFilter, setUnitSectorPreFilter] = useState<string>('ALL');
  const [sectorPickerOpen, setSectorPickerOpen] = useState(false);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);

  const sectors: SectorOption[] = useMemo(() => {
    if (source.role === 'ADMIN') return source.data.sectors ?? [];
    if (source.role === 'SECTOR') {
      return [
        {
          id: source.data.sector.id,
          name: source.data.sector.name,
          login_code: source.data.sector.login_code,
        },
      ];
    }
    return [];
  }, [source]);

  const authorizedUnits: UnitSummaryRow[] = useMemo(() => {
    if (source.role === 'ADMIN') return source.data.unit_summaries ?? [];
    if (source.role === 'SECTOR') {
      return (source.data.units ?? []).filter(
        (u) => u.sector_id == null || u.sector_id === source.data.sector.id
      );
    }
    return [];
  }, [source]);

  const filteredSectors = useMemo(() => {
    const q = sectorSearch.trim().toLowerCase();
    const sorted = [...sectors].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((s) =>
      `${s.name} ${s.login_code}`.toLowerCase().includes(q)
    );
  }, [sectors, sectorSearch]);

  const filteredUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    let list = [...authorizedUnits].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    if (source.role === 'ADMIN' && unitSectorPreFilter !== 'ALL') {
      list = list.filter((u) => String(u.sector_id) === unitSectorPreFilter);
    }
    if (!q) return list;
    return list.filter((u) =>
      `${u.name} ${u.login_code} ${u.sector_name ?? ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [authorizedUnits, source.role, unitSectorPreFilter, unitSearch]);

  const selectedSector = useMemo(
    () => sectors.find((s) => s.id === config.sectorId) ?? null,
    [sectors, config.sectorId]
  );

  const selectedUnit = useMemo(
    () => authorizedUnits.find((u) => u.id === config.unitId) ?? null,
    [authorizedUnits, config.unitId]
  );

  const updateConfig = (patch: Partial<ReportFilterConfig>) => {
    onChange(normalizeReportConfig({ ...config, ...patch, role: source.role }));
  };

  const handleScopeSelect = (nextScope: ReportScopeType) => {
    setSectorPickerOpen(false);
    setUnitPickerOpen(false);
    let nextSectorId = config.sectorId;
    let nextUnitId = config.unitId;

    if (nextScope === 'SECTOR_SPECIFIC' && nextSectorId == null && sectors[0]) {
      nextSectorId = sectors[0].id;
    }
    if (nextScope === 'UNIT_SPECIFIC') {
      if (nextUnitId == null && authorizedUnits[0]) {
        nextUnitId = authorizedUnits[0].id;
      }
      if (source.role === 'ADMIN' && unitSectorPreFilter !== 'ALL') {
        const preSectorNum = Number(unitSectorPreFilter);
        nextSectorId = Number.isFinite(preSectorNum) ? preSectorNum : null;
      }
    }

    updateConfig({
      scope: nextScope,
      sectorId: nextSectorId,
      unitId: nextUnitId,
    });
  };

  const isUnpaidLocked = config.template === 'UNPAID_DUES';
  const isModeDisabled = isUnpaidLocked || config.paymentStatus === 'UNPAID';
  const showZeroOrderToggle =
    config.template === 'UNIT_SUMMARY' || config.template === 'SECTOR_SUMMARY';

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* STEP 1: Scope Selection */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${theme.muted}`}
          >
            {source.role === 'UNIT' ? '1. Unit Scope' : '1. Select Scope'}
          </span>
        </div>

        {source.role === 'UNIT' ? (
          <div
            className={`${theme.innerCard} rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-8 h-8 rounded-lg ${theme.primaryBtn} flex items-center justify-center shrink-0`}
              >
                <MapPin className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className={`text-xs sm:text-sm font-bold truncate ${theme.heading}`}>
                  <BrandText text={source.data.unit.name} />
                </div>
                <div className={`text-[11px] truncate ${theme.muted}`}>
                  <span className="font-mono font-semibold num">
                    {source.data.unit.login_code}
                  </span>{' '}
                  • {source.data.unit.sector_name}
                </div>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${theme.badgeSoft}`}
            >
              This Unit Only
            </span>
          </div>
        ) : (
          <div
            className={`grid gap-2 ${
              allowedScopes.length === 4 ? 'grid-cols-2' : 'grid-cols-2'
            }`}
          >
            {allowedScopes.map((scopeKey) => {
              const meta = SCOPE_META[scopeKey];
              const Icon = meta.icon;
              const isSelected = config.scope === scopeKey;
              return (
                <button
                  key={scopeKey}
                  type="button"
                  onClick={() => handleScopeSelect(scopeKey)}
                  className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? theme.activeOptionCard
                      : `bg-white/85 ${theme.border} hover:bg-white`
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? theme.primaryBtn
                        : `${theme.pillSurface} ${theme.heading}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className={`text-xs font-bold leading-tight ${theme.heading}`}>
                      {scopeKey === 'UNIT_SPECIFIC' && source.role === 'SECTOR'
                        ? 'Specific Unit'
                        : meta.title}
                    </div>
                    <div className={`text-[10px] leading-snug mt-0.5 ${theme.muted}`}>
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Conditional Searchable Sector Picker (Admin SECTOR_SPECIFIC) */}
        {source.role === 'ADMIN' && config.scope === 'SECTOR_SPECIFIC' && (
          <div className={`${theme.innerCard} rounded-xl p-3 mt-2.5 space-y-2`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold ${theme.heading}`}>
                Choose Sector
              </span>
              <span className={`text-[10px] num ${theme.muted}`}>
                {sectors.length} sectors
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSectorPickerOpen((prev) => !prev)}
              aria-expanded={sectorPickerOpen}
              className={`w-full px-3 py-2 text-xs rounded-lg border ${theme.border} bg-white flex items-center justify-between gap-2 ${theme.inputFocus}`}
            >
              <span className={`truncate font-semibold ${theme.heading}`}>
                {selectedSector ? (
                  <>
                    <BrandText text={selectedSector.name} />{' '}
                    <span className="font-mono opacity-75">
                      ({selectedSector.login_code})
                    </span>
                  </>
                ) : (
                  'Select a sector...'
                )}
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${
                  sectorPickerOpen ? 'rotate-180' : ''
                } ${theme.muted}`}
              />
            </button>

            {sectorPickerOpen && (
              <div className={`rounded-lg border ${theme.border} bg-white p-2 space-y-2`}>
                <div className="relative">
                  <Search
                    className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme.muted}`}
                  />
                  <input
                    type="text"
                    value={sectorSearch}
                    onChange={(e) => setSectorSearch(e.target.value)}
                    placeholder="Search sector name or code..."
                    className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border ${theme.border} bg-white ${theme.inputFocus}`}
                  />
                  {sectorSearch && (
                    <button
                      type="button"
                      onClick={() => setSectorSearch('')}
                      aria-label="Clear sector search"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 ${theme.muted}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-black/5">
                  {filteredSectors.length === 0 ? (
                    <div className={`py-3 text-center text-xs ${theme.muted}`}>
                      No sectors found.
                    </div>
                  ) : (
                    filteredSectors.map((sec) => {
                      const active = sec.id === config.sectorId;
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => {
                            updateConfig({ sectorId: sec.id });
                            setSectorPickerOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 rounded-md transition-colors ${
                            active
                              ? theme.activeOptionCard
                              : 'hover:bg-black/[0.03]'
                          }`}
                        >
                          <span className="truncate font-semibold">
                            <BrandText text={sec.name} />
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[10px] opacity-75 num">
                              {sec.login_code}
                            </span>
                            {active && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conditional Searchable Unit Picker (Admin & Sector UNIT_SPECIFIC) */}
        {(source.role === 'ADMIN' || source.role === 'SECTOR') &&
          config.scope === 'UNIT_SPECIFIC' && (
            <div className={`${theme.innerCard} rounded-xl p-3 mt-2.5 space-y-2`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-[11px] font-bold ${theme.heading}`}>
                  Choose Unit
                </span>
                {source.role === 'ADMIN' && (
                  <select
                    aria-label="Pre-filter units by sector"
                    value={unitSectorPreFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUnitSectorPreFilter(val);
                      setUnitPickerOpen(true);
                      if (val !== 'ALL') {
                        const firstInSector = authorizedUnits.find(
                          (u) => String(u.sector_id) === val
                        );
                        updateConfig({
                          sectorId: Number(val),
                          unitId: firstInSector?.id ?? config.unitId,
                        });
                      } else {
                        updateConfig({ sectorId: null });
                      }
                    }}
                    className={`px-2 py-1 text-[11px] rounded-lg border ${theme.border} bg-white ${theme.heading} ${theme.inputFocus}`}
                  >
                    <option value="ALL">All Sectors ({authorizedUnits.length})</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => setUnitPickerOpen((prev) => !prev)}
                aria-expanded={unitPickerOpen}
                className={`w-full px-3 py-2 text-xs rounded-lg border ${theme.border} bg-white flex items-center justify-between gap-2 ${theme.inputFocus}`}
              >
                <span className={`truncate font-semibold ${theme.heading}`}>
                  {selectedUnit ? (
                    <>
                      <BrandText text={selectedUnit.name} />{' '}
                      <span className="font-mono opacity-75">
                        ({selectedUnit.login_code})
                      </span>
                      {selectedUnit.sector_name
                        ? ` — ${selectedUnit.sector_name}`
                        : ''}
                    </>
                  ) : (
                    'Select a unit...'
                  )}
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    unitPickerOpen ? 'rotate-180' : ''
                  } ${theme.muted}`}
                />
              </button>

              {unitPickerOpen && (
                <div className={`rounded-lg border ${theme.border} bg-white p-2 space-y-2`}>
                  <div className="relative">
                    <Search
                      className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme.muted}`}
                    />
                    <input
                      type="text"
                      value={unitSearch}
                      onChange={(e) => setUnitSearch(e.target.value)}
                      placeholder="Search unit name, code, or sector..."
                      className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border ${theme.border} bg-white ${theme.inputFocus}`}
                    />
                    {unitSearch && (
                      <button
                        type="button"
                        onClick={() => setUnitSearch('')}
                        aria-label="Clear unit search"
                        className={`absolute right-2 top-1/2 -translate-y-1/2 ${theme.muted}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-black/5">
                    {filteredUnits.length === 0 ? (
                      <div className={`py-3 text-center text-xs ${theme.muted}`}>
                        No matching units found.
                      </div>
                    ) : (
                      filteredUnits.map((unit) => {
                        const active = unit.id === config.unitId;
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => {
                              updateConfig({ unitId: unit.id });
                              setUnitPickerOpen(false);
                            }}
                            className={`w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 rounded-md transition-colors ${
                              active
                                ? theme.activeOptionCard
                                : 'hover:bg-black/[0.03]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                <BrandText text={unit.name} />
                              </div>
                              <div className={`text-[10px] truncate ${theme.muted}`}>
                                {unit.sector_name ?? ''}
                              </div>
                            </div>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-[10px] opacity-80 num">
                                {unit.login_code}
                              </span>
                              {active && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>

      {/* STEP 2: Report Template */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${theme.muted}`}
          >
            2. Report Type
          </span>
        </div>

        <div
          className={`grid gap-2 ${
            allowedTemplates.length >= 4
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          {allowedTemplates.map((tpl) => {
            const meta = TEMPLATE_META[tpl];
            const Icon = meta.icon;
            const isSelected = config.template === tpl;
            const displayTitle =
              source.role === 'UNIT' && tpl === 'DETAILED_ORDERS'
                ? 'Order & Reconciliation'
                : source.role === 'UNIT' && tpl === 'UNPAID_DUES'
                ? 'Unpaid Collection'
                : meta.title;
            return (
              <button
                key={tpl}
                type="button"
                onClick={() => updateConfig({ template: tpl })}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2 ${
                  isSelected
                    ? theme.activeOptionCard
                    : `bg-white/85 ${theme.border} hover:bg-white`
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected
                      ? theme.primaryBtn
                      : `${theme.pillSurface} ${theme.heading}`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className={`text-xs font-bold leading-tight ${theme.heading}`}>
                    {displayTitle}
                  </div>
                  <div className={`text-[10px] leading-snug mt-0.5 ${theme.muted}`}>
                    {meta.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 3: Smart Filters */}
      <div className={`${theme.innerCard} rounded-xl p-3 sm:p-3.5 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${theme.muted}`}
          >
            3. Smart Filters
          </span>
          {isUnpaidLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-vibrant-coralSoft text-vibrant-coral">
              <Lock className="w-2.5 h-2.5" />
              Locked to Unpaid
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Payment Status */}
          <div>
            <span className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}>
              Payment Status
            </span>
            <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl ${theme.pillSurface}`}>
              {(['ALL', 'PAID', 'UNPAID'] as const).map((status) => {
                const active = config.paymentStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={isUnpaidLocked}
                    onClick={() => updateConfig({ paymentStatus: status })}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-60 ${
                      active
                        ? theme.primaryBtn
                        : `${theme.muted} hover:text-black`
                    }`}
                  >
                    {status === 'ALL'
                      ? 'All'
                      : status === 'PAID'
                      ? 'Paid'
                      : 'Unpaid'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <span className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}>
              Payment Method
            </span>
            <div
              className={`grid grid-cols-3 gap-1 p-1 rounded-xl ${theme.pillSurface} ${
                isModeDisabled ? 'opacity-50' : ''
              }`}
            >
              {(['ALL', 'CASH', 'UPI'] as const).map((mode) => {
                const active = config.paymentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={isModeDisabled}
                    onClick={() => updateConfig({ paymentMode: mode })}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors disabled:cursor-not-allowed ${
                      active
                        ? theme.primaryBtn
                        : `${theme.muted} hover:text-black`
                    }`}
                  >
                    {mode === 'ALL'
                      ? 'All'
                      : mode === 'CASH'
                      ? 'Cash'
                      : 'UPI'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Date Filter + Sort Order */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-8">
            <span className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}>
              Date Range
            </span>
            <div className={`grid grid-cols-4 gap-1 p-1 rounded-xl ${theme.pillSurface}`}>
              {(
                [
                  { id: 'ALL', label: 'All Time' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'LAST_7_DAYS', label: '7 Days' },
                  { id: 'CUSTOM', label: 'Custom' },
                ] as { id: ReportDatePreset; label: string }[]
              ).map((preset) => {
                const active = config.datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateConfig({ datePreset: preset.id })}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                      active
                        ? theme.primaryBtn
                        : `${theme.muted} hover:text-black`
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-4">
            <label
              htmlFor={`report-sort-${source.role}-${compact ? 'm' : 'p'}`}
              className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}
            >
              Sort Order
            </label>
            <select
              id={`report-sort-${source.role}-${compact ? 'm' : 'p'}`}
              value={config.sortBy}
              onChange={(e) =>
                updateConfig({ sortBy: e.target.value as ReportSortBy })
              }
              className={`w-full px-2.5 py-2 text-xs font-semibold rounded-xl border ${theme.border} bg-white ${theme.heading} ${theme.inputFocus}`}
            >
              <option value="LATEST">Latest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="HIGHEST_QTY">Highest Quantity</option>
              <option value="NAME_ASC">Alphabetical (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Custom From / To Dates */}
        {config.datePreset === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label
                htmlFor={`date-from-${source.role}-${compact ? 'm' : 'p'}`}
                className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}
              >
                From Date
              </label>
              <input
                id={`date-from-${source.role}-${compact ? 'm' : 'p'}`}
                type="date"
                value={config.dateFrom}
                onChange={(e) => updateConfig({ dateFrom: e.target.value })}
                className={`w-full px-2.5 py-1.5 text-xs rounded-xl border ${theme.border} bg-white ${theme.heading} num ${theme.inputFocus}`}
              />
            </div>
            <div>
              <label
                htmlFor={`date-to-${source.role}-${compact ? 'm' : 'p'}`}
                className={`text-[11px] font-semibold block mb-1 ${theme.muted}`}
              >
                To Date
              </label>
              <input
                id={`date-to-${source.role}-${compact ? 'm' : 'p'}`}
                type="date"
                value={config.dateTo}
                onChange={(e) => updateConfig({ dateTo: e.target.value })}
                className={`w-full px-2.5 py-1.5 text-xs rounded-xl border ${theme.border} bg-white ${theme.heading} num ${theme.inputFocus}`}
              />
            </div>
          </div>
        )}

        {/* Include 0-order units toggle */}
        {showZeroOrderToggle && (
          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.includeZeroOrderUnits}
              onChange={(e) =>
                updateConfig({ includeZeroOrderUnits: e.target.checked })
              }
              className={`w-4 h-4 rounded ${theme.checkboxAccent}`}
            />
            <span className={`text-xs font-medium ${theme.heading}`}>
              Include zero-order{' '}
              {config.template === 'SECTOR_SUMMARY' ? 'sectors' : 'units'} in
              summary table
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
