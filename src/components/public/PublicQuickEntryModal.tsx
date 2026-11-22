import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  KeyRound,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { clearCached } from '../../lib/cache';
import { supabase } from '../../lib/supabase';
import type {
  PaymentMode,
  PaymentStatus,
  PublicAddOrderResponse,
  PublicLeaderboardSector,
  PublicLeaderboardUnit,
} from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveDecimal,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import {
  clearRememberedPublicUnit,
  getRememberedPublicUnit,
  saveRememberedPublicUnit,
  type RememberedPublicUnit,
} from '../../utils/publicQuickUnit';
import { notifyOrderCreated } from '../../utils/pushNotifications';
import { buildWhatsAppReceiptUrl } from '../../utils/whatsapp';

interface PublicQuickEntryModalProps {
  sectors: PublicLeaderboardSector[];
  units: PublicLeaderboardUnit[];
  perLiterRate: number;
  challengeTitle: string;
  ordersOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => Promise<void>;
}

const QUICK_LITERS = [1, 2, 3, 5, 10] as const;

interface CreatedPublicReceipt {
  id: number;
  contributorName: string;
  mobileNumber: string;
  unitName: string;
  sectorName: string;
  quantity: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode | null;
}

export function PublicQuickEntryModal({
  sectors,
  units,
  perLiterRate,
  challengeTitle,
  ordersOpen,
  onClose,
  onOrderCreated,
}: PublicQuickEntryModalProps) {
  const [remembered, setRemembered] = useState<RememberedPublicUnit | null>(
    () => getRememberedPublicUnit()
  );
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [sectorQuery, setSectorQuery] = useState('');
  const [unitQuery, setUnitQuery] = useState('');
  const debouncedSectorQuery = useDebouncedValue(sectorQuery, 100);
  const debouncedUnitQuery = useDebouncedValue(unitQuery, 100);
  const [unitCode, setUnitCode] = useState<string>('');

  const [contributorName, setContributorName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreatedPublicReceipt | null>(null);

  // Verify remembered unit still exists in live units list (if full directory is loaded)
  const validRemembered = useMemo(() => {
    if (!remembered) return null;
    if (units.length < 20) return remembered;
    const found = units.find((u) => u.id === remembered.unitId);
    if (!found) return null;
    return {
      ...remembered,
      unitName: found.name,
      sectorId: found.sector_id,
      sectorName: found.sector_name,
    };
  }, [remembered, units]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, submitting]);

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  const filteredSectors = useMemo(() => {
    const q = debouncedSectorQuery.trim().toLowerCase();
    if (!q) return sortedSectors;
    return sortedSectors.filter((s) => s.name.toLowerCase().includes(q));
  }, [sortedSectors, debouncedSectorQuery]);

  const selectedSector = useMemo(
    () =>
      selectedSectorId
        ? sortedSectors.find((s) => String(s.id) === selectedSectorId) ?? null
        : null,
    [sortedSectors, selectedSectorId]
  );

  const filteredSectorUnits = useMemo(() => {
    if (!selectedSectorId) return [];
    const secIdNum = Number(selectedSectorId);
    const q = debouncedUnitQuery.trim().toLowerCase();
    return units
      .filter((u) => u.sector_id === secIdNum)
      .filter((u) => (!q ? true : u.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [units, selectedSectorId, debouncedUnitQuery]);

  const activeUnit = useMemo(() => {
    if (validRemembered) {
      return {
        id: validRemembered.unitId,
        name: validRemembered.unitName,
        sectorId: validRemembered.sectorId,
        sectorName: validRemembered.sectorName,
      };
    }
    if (!selectedSectorId || !selectedUnitId) return null;
    const unitNum = Number(selectedUnitId);
    const found = units.find((u) => u.id === unitNum);
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      sectorId: found.sector_id,
      sectorName: found.sector_name,
    };
  }, [validRemembered, selectedSectorId, selectedUnitId, units]);

  const parsedQty = Number.parseFloat(quantity);
  const safeQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 0;
  const previewTotal = Math.round(safeQty * perLiterRate * 100) / 100;

  const handleSectorSelect = (secId: string) => {
    setSelectedSectorId(secId);
    setSelectedUnitId('');
    setUnitQuery('');
    setError(null);
  };

  const handleUnitSelect = (unitId: string) => {
    setSelectedUnitId(unitId);
    setError(null);
  };

  const handleSwitchUnit = () => {
    clearRememberedPublicUnit();
    setRemembered(null);
    setSelectedSectorId('');
    setSelectedUnitId('');
    setSectorQuery('');
    setUnitQuery('');
    setUnitCode('');
    setError(null);
  };

  const handleStep = (delta: number) => {
    const current = Number.parseFloat(quantity);
    const base = Number.isFinite(current) && current > 0 ? current : 1;
    const next = Math.max(1, Math.round((base + delta) * 100) / 100);
    setQuantity(String(next));
  };

  const resetForAnother = () => {
    setContributorName('');
    setMobileNumber('');
    setQuantity('1');
    setPaymentStatus(null);
    setPaymentMethod(null);
    setError(null);
    setReceipt(null);
  };

  const mapServerError = (rawMessage: string): string => {
    const msg = rawMessage || '';
    if (msg.includes('INVALID_UNIT_CODE')) {
      return 'യൂണിറ്റ് കോഡ് തെറ്റാണ്! നിങ്ങളുടെ യൂണിറ്റ് സെക്രട്ടറിയിൽ നിന്ന് ശരിയായ കോഡ് പരിശോധിച്ച് നൽകുക.';
    }
    if (msg.includes('ORDERS_CLOSED')) {
      return 'ഓർഡർ സ്വീകരിക്കുന്നത് താൽക്കാലികമായി ക്ലോസ് ചെയ്തിരിക്കുകയാണ്.';
    }
    return msg || 'ഓർഡർ സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.';
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!ordersOpen) {
      setError('ഓർഡർ സ്വീകരിക്കുന്നത് താൽക്കാലികമായി ക്ലോസ് ചെയ്തിരിക്കുകയാണ്.');
      return;
    }

    if (!activeUnit) {
      setError('ദയവായി സെക്ടറും യൂണിറ്റും തിരഞ്ഞെടുക്കുക.');
      return;
    }

    const cleanCode = unitCode.trim().toUpperCase();
    const cleanName = contributorName.trim();
    const cleanMobile = sanitizePositiveInteger(mobileNumber);

    if (!cleanCode) {
      setError('യൂണിറ്റ് കോഡ് നിർബന്ധമാണ് (ഉദാ: WDR12).');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('അളവ് (ലിറ്റർ) പൂജ്യത്തേക്കാൾ കൂടുതൽ ആയിരിക്കണം.');
      return;
    }
    if (!cleanName) {
      setError('കസ്റ്റമറുടെ പേര് നിർബന്ധമാണ്.');
      return;
    }
    if (cleanMobile.length < 10) {
      setError('കൃത്യമായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക.');
      return;
    }
    if (paymentStatus === null) {
      setError('Paid അല്ലെങ്കിൽ Unpaid സ്റ്റാറ്റസ് നിർബന്ധമായും തിരഞ്ഞെടുക്കുക.');
      return;
    }
    if (paymentStatus === 'PAID' && paymentMethod === null) {
      setError('Paid ഓർഡറിന് Cash Handover അല്ലെങ്കിൽ UPI തിരഞ്ഞെടുക്കുക.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: created, error: rpcError } = await supabase.rpc(
        'public_add_order',
        {
          p_unit_id: activeUnit.id,
          p_unit_code: cleanCode,
          p_contributor_name: cleanName,
          p_mobile: cleanMobile,
          p_quantity: parsedQty,
          p_payment_status: paymentStatus,
          p_payment_mode: paymentStatus === 'PAID' ? paymentMethod : null,
        }
      );

      if (rpcError) {
        setError(mapServerError(rpcError.message));
        return;
      }

      const res = created as PublicAddOrderResponse;

      // Save/slide 14-day device memory (NEVER stores unitCode)
      const savedMem = saveRememberedPublicUnit({
        sectorId: activeUnit.sectorId,
        sectorName: activeUnit.sectorName,
        unitId: activeUnit.id,
        unitName: res.unit_name || activeUnit.name,
      });
      setRemembered(savedMem);

      setReceipt({
        id: res.id,
        contributorName: cleanName,
        mobileNumber: cleanMobile,
        unitName: res.unit_name || activeUnit.name,
        sectorName: res.sector_name || activeUnit.sectorName,
        quantity: Number(res.quantity),
        totalAmount: Number(res.total_amount),
        paymentStatus: res.payment_status,
        paymentMode: res.payment_mode,
      });

      if (typeof res?.id === 'number' && res.id > 0) {
        notifyOrderCreated(res.id, 'public');
      }

      clearCached('wdr_public_stats_v1');
      clearCached('wdr_public_leaderboard_v1');
      void onOrderCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? mapServerError(err.message)
          : 'ഓർഡർ സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openReceiptWhatsApp = () => {
    if (!receipt) return;
    const url = buildWhatsAppReceiptUrl({
      contributorName: receipt.contributorName,
      mobileNumber: receipt.mobileNumber,
      unitName: receipt.unitName,
      quantity: receipt.quantity,
      totalAmount: receipt.totalAmount,
      paymentStatus: receipt.paymentStatus,
      paymentMode: receipt.paymentMode,
      challengeTitle,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-quick-entry-title"
      className="fixed inset-0 z-[70] bg-[#2B0406]/55 backdrop-blur-md flex items-start justify-center pt-[max(1rem,env(safe-area-inset-top))] px-3 pb-4 sm:items-center sm:p-4 overflow-y-auto"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg min-h-[70dvh] sm:min-h-0 max-h-[90dvh] flex flex-col bg-[#FFF8F6]/[0.92] backdrop-blur-2xl rounded-3xl border border-[#5C0A0E]/20 shadow-[0_24px_64px_-12px_rgba(43,4,6,0.48),inset_0_1px_0_rgba(255,255,255,0.95)] overflow-hidden"
      >
        {/* Frosted Glass Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#5C0A0E]/[0.08] via-[#C40E16]/[0.04] to-transparent border-b border-[#5C0A0E]/14 flex items-center justify-between shrink-0">
          <div>
            <h2
              id="public-quick-entry-title"
              className="font-ml text-base sm:text-lg font-bold text-[#2B0406]"
            >
              ക്വിക്ക് ഓർഡർ എൻട്രി
            </h2>
            <p className="text-[11px] sm:text-xs font-semibold text-[#7A2E33] num">
              Rate: {formatCurrency(perLiterRate)} / L
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="ക്ലോസ് ചെയ്യുക"
            className="p-2 rounded-full bg-white/70 border border-[#5C0A0E]/15 text-[#4A070A] hover:text-[#2B0406] hover:bg-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 flex flex-col">
          {!ordersOpen && !receipt ? (
            <div className="p-6 text-center space-y-4 my-auto">
              <div className="w-12 h-12 rounded-2xl bg-[#5C0A0E]/10 text-[#5C0A0E] flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-ml text-base font-bold text-[#2B0406]">
                  ഓർഡറുകൾ ക്ലോസ് ചെയ്തിരിക്കുകയാണ്
                </h3>
                <p className="font-ml text-xs text-[#7A2E33] mt-1 leading-relaxed">
                  ഡിവിഷൻ അഡ്മിൻ പുതിയ പബ്ലിക് ഓർഡറുകൾ സ്വീകരിക്കുന്നത് താൽക്കാലികമായി നിർത്തിവെച്ചിരിക്കുകയാണ്.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl glass-crimson text-white font-ml text-xs font-bold"
              >
                തിരികെ പോകുക
              </button>
            </div>
          ) : receipt ? (
            <div className="p-5 sm:p-6 space-y-5">
              <div className="rounded-2xl bg-emerald-50/90 backdrop-blur-md border border-emerald-200 p-4 flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-700 shrink-0" />
                <div>
                  <h3 className="font-ml text-sm font-bold text-emerald-950">
                    ഓർഡർ വിജയകരമായി രേഖപ്പെടുത്തി!
                  </h3>
                  <p className="text-xs text-emerald-800 num mt-0.5">
                    {receipt.unitName} ({receipt.sectorName}) •{' '}
                    {formatQuantity(receipt.quantity)} L •{' '}
                    {formatCurrency(receipt.totalAmount)} •{' '}
                    {receipt.paymentStatus === 'PAID'
                      ? `Paid (${receipt.paymentMode})`
                      : 'Unpaid'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-[#5C0A0E]/14 p-4 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[#7A2E33]">Customer</span>
                  <span className="font-semibold text-[#2B0406] text-right">
                    {receipt.contributorName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#7A2E33]">Mobile</span>
                  <span className="font-semibold text-[#2B0406] num">
                    {receipt.mobileNumber}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#7A2E33]">Unit</span>
                  <span className="font-semibold text-[#2B0406] text-right">
                    {receipt.unitName} ({receipt.sectorName})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#7A2E33]">Quantity &amp; Total</span>
                  <span className="font-bold text-[#5C0A0E] num">
                    {formatQuantity(receipt.quantity)} L (
                    {formatCurrency(receipt.totalAmount)})
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={openReceiptWhatsApp}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>Send WhatsApp Receipt</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={resetForAnother}
                    className="py-2.5 px-3 rounded-xl border border-[#5C0A0E]/20 bg-white/90 text-xs font-bold text-[#2B0406] hover:bg-white transition-colors"
                  >
                    + Add Another Order
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2.5 px-3 rounded-xl glass-crimson text-white text-xs font-bold hover:opacity-95 transition-opacity"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 flex-1">
              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-ml font-medium text-rose-900 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Remembered Unit Pill (14-Day Device Memory) OR Modern Frosted Glass Sector -> Unit Selector */}
              {validRemembered ? (
                <div className="rounded-2xl bg-white/75 backdrop-blur-xl border border-[#5C0A0E]/18 px-3.5 py-3 flex items-center justify-between gap-3 shadow-xs">
                  <div className="min-w-0">
                    <p className="font-ml text-[10px] font-semibold uppercase tracking-wide text-[#7A2E33]">
                      തിരഞ്ഞെടുത്ത യൂണിറ്റ് (14 ദിവസത്തേക്ക് ഓർമ്മിച്ചിരിക്കുന്നു)
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-[#2B0406] truncate mt-0.5">
                      {validRemembered.unitName}{' '}
                      <span className="font-medium text-[#7A2E33]">
                        • {validRemembered.sectorName}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchUnit}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#5C0A0E]/[0.08] border border-[#5C0A0E]/18 text-[11px] font-ml font-bold text-[#5C0A0E] hover:bg-[#5C0A0E]/15 transition-colors"
                  >
                    മാറ്റുക
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Step 1: Sector Glass Picker */}
                  {!selectedSector ? (
                    <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-[#5C0A0E]/16 p-3.5 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-ml text-xs font-bold text-[#2B0406] inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#C40E16]" />
                          1. സെക്ടർ തിരഞ്ഞെടുക്കുക (Select Sector)
                        </span>
                        <span className="text-[11px] font-semibold text-[#7A2E33] num">
                          {filteredSectors.length} Sectors
                        </span>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#7A2E33]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={sectorQuery}
                          onChange={(e) => setSectorQuery(e.target.value)}
                          placeholder="സെക്ടർ തിരയുക..."
                          className="w-full pl-8 pr-3 py-2 text-xs font-ml rounded-xl border border-[#5C0A0E]/16 bg-white/90 text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[42dvh] overflow-y-auto pr-0.5">
                        {filteredSectors.map((sec) => (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => handleSectorSelect(String(sec.id))}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/80 hover:bg-white backdrop-blur-md border border-[#5C0A0E]/14 hover:border-[#5C0A0E]/35 text-xs sm:text-sm font-bold text-[#2B0406] flex items-center justify-between gap-2 shadow-2xs transition-all"
                          >
                            <span className="truncate">{sec.name}</span>
                            <ChevronRight className="w-4 h-4 text-[#7A2E33] shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Selected Sector Glass Pill */
                    <div className="rounded-2xl bg-white/75 backdrop-blur-xl border border-[#5C0A0E]/18 px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl glass-crimson text-white inline-flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-ml text-[10px] font-semibold text-[#7A2E33]">
                            തിരഞ്ഞെടുത്ത സെക്ടർ
                          </p>
                          <p className="text-xs sm:text-sm font-bold text-[#2B0406] truncate">
                            {selectedSector.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSectorId('');
                          setSelectedUnitId('');
                          setUnitQuery('');
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-[#5C0A0E]/[0.08] border border-[#5C0A0E]/18 text-[11px] font-ml font-bold text-[#5C0A0E] hover:bg-[#5C0A0E]/15 transition-colors"
                      >
                        മാറ്റുക
                      </button>
                    </div>
                  )}

                  {/* Step 2: Unit Glass Picker — strictly hidden until Sector is selected */}
                  {selectedSector && !activeUnit && (
                    <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-[#5C0A0E]/16 p-3.5 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-ml text-xs font-bold text-[#2B0406] inline-flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#C40E16]" />
                          2. യൂണിറ്റ് തിരഞ്ഞെടുക്കുക (Select Unit)
                        </span>
                        <span className="text-[11px] font-semibold text-[#7A2E33] num">
                          {filteredSectorUnits.length} Units
                        </span>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#7A2E33]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={unitQuery}
                          onChange={(e) => setUnitQuery(e.target.value)}
                          placeholder="യൂണിറ്റ് തിരയുക..."
                          className="w-full pl-8 pr-3 py-2 text-xs font-ml rounded-xl border border-[#5C0A0E]/16 bg-white/90 text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[38dvh] overflow-y-auto pr-0.5">
                        {filteredSectorUnits.map((unit) => (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => handleUnitSelect(String(unit.id))}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/80 hover:bg-white backdrop-blur-md border border-[#5C0A0E]/14 hover:border-[#5C0A0E]/35 text-xs sm:text-sm font-bold text-[#2B0406] flex items-center justify-between gap-2 shadow-2xs transition-all"
                          >
                            <span className="truncate">{unit.name}</span>
                            <ChevronRight className="w-4 h-4 text-[#7A2E33] shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Selected Unit Glass Pill (before first submit) */}
                  {selectedSector && activeUnit && (
                    <div className="rounded-2xl bg-white/75 backdrop-blur-xl border border-[#5C0A0E]/18 px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl glass-crimson text-white inline-flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-ml text-[10px] font-semibold text-[#7A2E33]">
                            തിരഞ്ഞെടുത്ത യൂണിറ്റ്
                          </p>
                          <p className="text-xs sm:text-sm font-bold text-[#2B0406] truncate">
                            {activeUnit.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUnitId('')}
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-[#5C0A0E]/[0.08] border border-[#5C0A0E]/18 text-[11px] font-ml font-bold text-[#5C0A0E] hover:bg-[#5C0A0E]/15 transition-colors"
                      >
                        മാറ്റുക
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Order Entry Fields — visible once activeUnit is chosen */}
              {activeUnit && (
                <div className="space-y-4 pt-1">
                  {/* Unit Order Code */}
                  <div>
                    <label
                      htmlFor="pub-unit-code"
                      className="block font-ml text-xs font-bold text-[#2B0406] mb-1"
                    >
                      യൂണിറ്റ് കോഡ് (Unit Order Code)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#7A2E33]/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="pub-unit-code"
                        type="text"
                        required
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        value={unitCode}
                        onChange={(e) =>
                          setUnitCode(e.target.value.toUpperCase())
                        }
                        placeholder="ഉദാ: WDR12"
                        className="w-full pl-9 pr-3 py-2.5 text-sm font-bold uppercase tracking-wider rounded-xl border border-[#5C0A0E]/20 bg-white/90 backdrop-blur-md text-[#2B0406] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                      />
                    </div>
                  </div>

                  {/* Quantity */}
                  <div className="rounded-2xl bg-white/75 backdrop-blur-xl border border-[#5C0A0E]/16 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="pub-qty-input"
                        className="font-ml text-xs font-bold text-[#2B0406]"
                      >
                        അളവ് — ലിറ്റർ (Quantity)
                      </label>
                      <span className="text-sm font-extrabold text-[#5C0A0E] num">
                        Total: {formatCurrency(previewTotal)}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {QUICK_LITERS.map((q) => {
                        const active = Number.parseFloat(quantity) === q;
                        return (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setQuantity(String(q))}
                            className={`py-2 rounded-xl text-xs font-bold num transition-all ${
                              active
                                ? 'glass-crimson text-white shadow-sm'
                                : 'bg-white/90 border border-[#5C0A0E]/15 text-[#4A070A] hover:bg-white'
                            }`}
                          >
                            {q}L
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStep(-1)}
                        aria-label="Decrease quantity"
                        className="w-10 h-10 rounded-xl bg-white/90 border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-white shrink-0"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        id="pub-qty-input"
                        type="text"
                        inputMode="decimal"
                        value={quantity}
                        onKeyDown={blockNegativeNumericKeys}
                        onChange={(e) =>
                          setQuantity(sanitizePositiveDecimal(e.target.value))
                        }
                        placeholder="Custom Liters"
                        className="flex-1 text-center py-2 px-3 rounded-xl border border-[#5C0A0E]/20 bg-white/95 text-sm font-bold text-[#2B0406] num focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                      />
                      <button
                        type="button"
                        onClick={() => handleStep(1)}
                        aria-label="Increase quantity"
                        className="w-10 h-10 rounded-xl bg-white/90 border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-white shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="pub-customer-name"
                        className="block font-ml text-xs font-bold text-[#2B0406] mb-1"
                      >
                        കസ്റ്റമറുടെ പേര്
                      </label>
                      <input
                        id="pub-customer-name"
                        type="text"
                        required
                        value={contributorName}
                        onChange={(e) => setContributorName(e.target.value)}
                        placeholder="Customer Name"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-[#5C0A0E]/20 bg-white/90 backdrop-blur-md text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="pub-customer-mobile"
                        className="block font-ml text-xs font-bold text-[#2B0406] mb-1"
                      >
                        മൊബൈൽ നമ്പർ (10 അക്കം)
                      </label>
                      <input
                        id="pub-customer-mobile"
                        type="tel"
                        inputMode="numeric"
                        maxLength={12}
                        required
                        value={mobileNumber}
                        onChange={(e) =>
                          setMobileNumber(
                            sanitizePositiveInteger(e.target.value)
                          )
                        }
                        placeholder="10-digit WhatsApp No."
                        className="w-full px-3 py-2 text-sm rounded-xl border border-[#5C0A0E]/20 bg-white/90 backdrop-blur-md text-[#2B0406] num placeholder:text-[#7A2E33]/50 focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                      />
                    </div>
                  </div>

                  {/* Mandatory Payment Selection (Zero Default) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-ml text-xs font-bold text-[#2B0406]">
                        പേയ്‌മെന്റ് സ്റ്റാറ്റസ് (നിർബന്ധം)
                      </span>
                      {paymentStatus === null && (
                        <span className="text-[11px] font-semibold text-[#C40E16]">
                          Paid / Unpaid തിരഞ്ഞെടുക്കുക
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPaymentStatus('PAID')}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          paymentStatus === 'PAID'
                            ? 'bg-emerald-700 border-emerald-800 text-white shadow-sm'
                            : 'bg-white/85 border-[#5C0A0E]/18 text-[#2B0406] hover:bg-white'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Paid (ലഭിച്ചു)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaymentStatus('UNPAID');
                          setPaymentMethod(null);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          paymentStatus === 'UNPAID'
                            ? 'bg-amber-600 border-amber-700 text-white shadow-sm'
                            : 'bg-white/85 border-[#5C0A0E]/18 text-[#2B0406] hover:bg-white'
                        }`}
                      >
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Unpaid (ബാക്കി)</span>
                      </button>
                    </div>

                    {paymentStatus === 'PAID' && (
                      <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CASH')}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            paymentMethod === 'CASH'
                              ? 'glass-crimson text-white shadow-sm'
                              : 'bg-white/85 border-[#5C0A0E]/18 text-[#4A070A] hover:bg-white'
                          }`}
                        >
                          <Wallet className="w-3.5 h-3.5 shrink-0" />
                          <span>Cash Handover</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod('UPI')}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            paymentMethod === 'UPI'
                              ? 'glass-crimson text-white shadow-sm'
                              : 'bg-white/85 border-[#5C0A0E]/18 text-[#4A070A] hover:bg-white'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5 shrink-0" />
                          <span>UPI (GPay)</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl glass-crimson text-white font-ml text-sm font-bold shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
                  >
                    {submitting
                      ? 'സേവ് ചെയ്യുന്നു...'
                      : `ഓർഡർ സേവ് ചെയ്യുക (${formatCurrency(previewTotal)})`}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PublicQuickEntryModal;
