import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  PlusCircle,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PublicSectorOption, PublicUnitOption } from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import { SelectDropdown } from '../SelectDropdown';

interface OpenPublicOrderModalProps {
  perLiterRate: number;
  onClose: () => void;
}

const QUICK_LITER_CHIPS = [1, 2, 3, 5, 10] as const;

interface SubmittedReceipt {
  id: string;
  customer_name: string;
  mobile: string;
  quantity: number;
  total_amount: number;
  unit_name: string | null;
  sector_name: string | null;
}

export default function OpenPublicOrderModal({
  perLiterRate,
  onClose,
}: OpenPublicOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  const [sectors, setSectors] = useState<PublicSectorOption[]>([]);
  const [units, setUnits] = useState<PublicUnitOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmittedReceipt | null>(null);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'get_public_unit_options'
        );
        if (!active || rpcError || !data) return;
        const parsed = data as {
          sectors?: PublicSectorOption[];
          units?: PublicUnitOption[];
        };
        setSectors(Array.isArray(parsed.sectors) ? parsed.sectors : []);
        setUnits(Array.isArray(parsed.units) ? parsed.units : []);
      } finally {
        if (active) setOptionsLoading(false);
      }
    };
    void loadOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const filteredUnits = useMemo(() => {
    const base =
      sectorFilter === 'ALL'
        ? units
        : units.filter((u) => String(u.sector_id) === sectorFilter);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [units, sectorFilter]);

  const sectorOptions = useMemo(
    () => [
      {
        value: 'ALL',
        label: 'എല്ലാ സെക്ടറുകളും / All Sectors',
      },
      ...[...sectors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          value: String(s.id),
          label: s.name,
        })),
    ],
    [sectors]
  );

  const unitOptions = useMemo(
    () => [
      {
        value: '',
        label: 'തിരഞ്ഞെടുത്തിട്ടില്ല / Not Selected (Optional)',
      },
      ...filteredUnits.map((u) => ({
        value: String(u.id),
        label: u.name,
      })),
    ],
    [filteredUnits]
  );

  const numericQty = Number.parseInt(quantity, 10);
  const validQty =
    Number.isInteger(numericQty) && numericQty >= 1 ? numericQty : 0;
  const computedTotal = Math.round(validQty * perLiterRate * 100) / 100;

  const handleStep = (delta: number) => {
    const base = Number.isInteger(numericQty) && numericQty >= 1 ? numericQty : 1;
    const next = Math.min(500, Math.max(1, base + delta));
    setQuantity(String(next));
  };

  const handleSectorChange = (nextSector: string) => {
    setSectorFilter(nextSector);
    if (
      nextSector !== 'ALL' &&
      selectedUnitId &&
      !units.some(
        (u) =>
          String(u.id) === selectedUnitId && String(u.sector_id) === nextSector
      )
    ) {
      setSelectedUnitId('');
    }
  };

  const handlePlaceAnother = () => {
    setReceipt(null);
    setCustomerName('');
    setMobile('');
    setQuantity('1');
    setSectorFilter('ALL');
    setSelectedUnitId('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = customerName.trim();
    if (cleanName.length < 2) {
      setError('ദയവായി നിങ്ങളുടെ പേര് നൽകുക / Please enter your full name.');
      return;
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError(
        'ദയവായി 10 അക്ക സാധുവായ മൊബൈൽ നമ്പർ നൽകുക / Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    if (!Number.isInteger(numericQty) || numericQty < 1 || numericQty > 500) {
      setError(
        'ഒരു ലിറ്ററോ ഒന്നിലധികം പൂർണ്ണ ലിറ്ററോ മാത്രമേ നൽകാനാകൂ (1L, 2L, 3L...) / Only whole liters (1L, 2L, 3L...) are allowed.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const unitIdNum = selectedUnitId ? Number(selectedUnitId) : null;
      const { data, error: rpcError } = await supabase.rpc(
        'submit_public_order_request',
        {
          p_customer_name: cleanName,
          p_mobile: cleanMobile,
          p_quantity: numericQty,
          p_unit_id: unitIdNum,
        }
      );

      if (rpcError) {
        setError(rpcError.message || 'Unable to submit your order request.');
        return;
      }

      const res = data as SubmittedReceipt;
      setReceipt(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error while submitting order request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-order-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2B0406]/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FFF8F6] border border-[#5C0A0E]/20 shadow-2xl text-[#2B0406] pb-[env(safe-area-inset-bottom,0px)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 glass-crimson text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-white/15 border border-white/25 text-[#FCE36D] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="open-order-modal-title"
                className="text-base font-extrabold text-white truncate font-ml"
              >
                ഓർഡർ നൽകുക / Place Order
              </h2>
              <p className="text-[11px] text-white/80 font-medium">
                ഓർഡർ കോഡ് ആവശ്യമില്ല • No Order Code Required
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receipt ? (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="rounded-2xl bg-white border border-[#5C0A0E]/14 p-5 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl glass-crimson-solid text-[#FCE36D] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-[#2B0406] font-ml">
                ഓർഡർ അപേക്ഷ ലഭിച്ചു! / Order Request Received!
              </h3>
              <p className="text-xs sm:text-sm text-[#4A070A] leading-relaxed font-ml">
                താങ്കളുടെ ഓർഡർ അപേക്ഷ ലഭിച്ചിട്ടുണ്ട്! ഡിവിഷൻ കമ്മിറ്റി പരിശോധിച്ച്
                ഉടൻ ഉറപ്പാക്കുന്നതാണ്.
              </p>
              <p className="text-xs text-[#7A2E33] leading-relaxed">
                Your order request has been received and will be confirmed
                shortly by the Division Committee.
              </p>
            </div>

            <div className="rounded-2xl bg-white/90 border border-[#5C0A0E]/12 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#7A2E33]">പേര് / Name</span>
                <span className="font-bold text-[#2B0406]">
                  {receipt.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A2E33]">ഫോൺ / Mobile</span>
                <span className="font-bold text-[#2B0406] num">
                  +91 {receipt.mobile}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A2E33]">അളവ് / Quantity</span>
                <span className="font-bold text-[#2B0406] num">
                  {formatQuantity(receipt.quantity)} L
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A2E33]">തുക / Total Amount</span>
                <span className="font-extrabold text-[#5C0A0E] num">
                  {formatCurrency(receipt.total_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A2E33]">യൂണിറ്റ് / Unit</span>
                <span className="font-semibold text-[#4A070A]">
                  {receipt.unit_name ?? 'തിരഞ്ഞെടുത്തിട്ടില്ല / Not Selected'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handlePlaceAnother}
                className="flex-1 h-11 rounded-2xl glass-crimson-solid hover:opacity-95 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-opacity shadow-sm font-ml"
              >
                <PlusCircle className="w-4 h-4 text-[#FCE36D]" />
                <span>മറ്റൊരു ഓർഡർ നൽകുക / Place Another Order</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-5 rounded-2xl bg-white border border-[#5C0A0E]/18 hover:bg-[#5C0A0E]/5 text-[#4A070A] text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-2xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-800"
              >
                {error}
              </div>
            )}

            {/* 1. Full Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="open-order-name"
                className="block text-xs font-bold text-[#2B0406] font-ml"
              >
                പേര് / Full Name <span className="text-[#C40E16]">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#7A2E33] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="open-order-name"
                  type="text"
                  required
                  maxLength={100}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ഉദാ: മുഹമ്മദ് അലി / e.g. Muhammed Ali"
                  className="w-full h-11 pl-10 pr-3.5 rounded-2xl bg-white border border-[#5C0A0E]/20 text-sm text-[#2B0406] placeholder:text-[#7A2E33]/55 focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
              </div>
            </div>

            {/* 2. Mobile Number */}
            <div className="space-y-1.5">
              <label
                htmlFor="open-order-mobile"
                className="block text-xs font-bold text-[#2B0406] font-ml"
              >
                ഫോൺ നമ്പർ / Mobile Number{' '}
                <span className="text-[#C40E16]">*</span>
              </label>
              <div className="relative flex items-center">
                <Phone className="w-4 h-4 text-[#7A2E33] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <span className="absolute left-10 text-xs font-bold text-[#7A2E33] select-none">
                  +91
                </span>
                <input
                  id="open-order-mobile"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={10}
                  value={mobile}
                  onKeyDown={blockNegativeNumericKeys}
                  onChange={(e) =>
                    setMobile(sanitizePositiveInteger(e.target.value).slice(0, 10))
                  }
                  placeholder="9876543210"
                  className="w-full h-11 pl-[4.4rem] pr-3.5 rounded-2xl bg-white border border-[#5C0A0E]/20 text-sm font-semibold num text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
              </div>
            </div>

            {/* 3. Quantity (Whole Liters Only: 1L, 2L, 3L...) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="open-order-qty"
                  className="block text-xs font-bold text-[#2B0406] font-ml"
                >
                  എത്ര ലിറ്റർ / Quantity (Liters){' '}
                  <span className="text-[#C40E16]">*</span>
                </label>
                <span className="text-[11px] font-bold text-[#5C0A0E] num">
                  {formatCurrency(perLiterRate)} / L
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_LITER_CHIPS.map((chip) => {
                  const active = validQty === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setQuantity(String(chip))}
                      className={`py-2 rounded-xl text-xs font-extrabold num transition-colors ${
                        active
                          ? 'glass-crimson text-white shadow-sm'
                          : 'bg-white border border-[#5C0A0E]/16 text-[#4A070A] hover:bg-[#5C0A0E]/5'
                      }`}
                    >
                      {chip}L
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  disabled={submitting || validQty <= 1}
                  aria-label="Decrease quantity"
                  className="w-10 h-11 rounded-2xl bg-white border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-[#5C0A0E]/5 disabled:opacity-40 shrink-0"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="open-order-qty"
                  type="text"
                  inputMode="numeric"
                  required
                  value={quantity}
                  onKeyDown={(e) => {
                    blockNegativeNumericKeys(e);
                    if (e.key === '.' || e.key === ',') {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    setQuantity(sanitizePositiveInteger(e.target.value))
                  }
                  placeholder="1"
                  className="w-20 h-11 px-2 text-center rounded-2xl bg-white border border-[#5C0A0E]/20 text-base font-extrabold num text-[#2B0406] focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={submitting}
                  aria-label="Increase quantity"
                  className="w-10 h-11 rounded-2xl bg-white border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-[#5C0A0E]/5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="flex-1 h-11 px-3.5 rounded-2xl bg-[#5C0A0E]/[0.06] border border-[#5C0A0E]/12 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#7A2E33] font-ml">
                    ആകെ / Total
                  </span>
                  <span className="text-sm font-extrabold text-[#5C0A0E] num">
                    {formatCurrency(computedTotal)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#7A2E33] font-ml">
                1 ലിറ്റർ, 2 ലിറ്റർ എന്നിങ്ങനെ പൂർണ്ണ ലിറ്ററുകൾ മാത്രമേ നൽകാനാകൂ.
              </p>
            </div>

            {/* 4. Optional Unit Selection */}
            <div className="rounded-2xl bg-white/85 border border-[#5C0A0E]/14 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#5C0A0E] shrink-0" />
                <span className="text-xs font-bold text-[#2B0406] font-ml">
                  യൂണിറ്റ് (ഓപ്ഷണൽ — നിർബന്ധമില്ല) / Unit (Optional)
                </span>
              </div>

              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${
                  optionsLoading ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <SelectDropdown
                  value={sectorFilter}
                  onChange={handleSectorChange}
                  options={sectorOptions}
                  ariaLabel="Optional Sector Filter"
                />
                <SelectDropdown
                  value={selectedUnitId}
                  onChange={setSelectedUnitId}
                  options={unitOptions}
                  ariaLabel="Optional Unit Selection"
                />
              </div>
              <p className="text-[11px] text-[#7A2E33] font-ml">
                യൂണിറ്റ് അറിയില്ലെങ്കിൽ തിരഞ്ഞെടുക്കാതെ തന്നെ ഓർഡർ നൽകാം.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-2xl glass-crimson-solid hover:opacity-95 disabled:opacity-60 text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-opacity shadow-md font-ml"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>സമർപ്പിക്കുന്നു... / Submitting...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 text-[#FCE36D]" />
                  <span>ഓർഡർ സമർപ്പിക്കുക / Submit Order</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
