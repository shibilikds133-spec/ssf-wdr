import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
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
  sanitizePositiveDecimal,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';
import { SelectDropdown } from '../SelectDropdown';

interface OpenPublicOrderModalProps {
  perLiterRate: number;
  lang: 'ml' | 'en';
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
  lang,
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
        label:
          lang === 'ml'
            ? 'എല്ലാ സെക്ടറുകളും / All Sectors'
            : 'All Sectors / എല്ലാ സെക്ടറുകളും',
      },
      ...[...sectors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          value: String(s.id),
          label: s.name,
        })),
    ],
    [sectors, lang]
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

  const numericQty = Number(quantity);
  const validQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 0;
  const computedTotal = Math.round(validQty * perLiterRate * 100) / 100;

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
      setError(
        lang === 'ml'
          ? 'ദയവായി നിങ്ങളുടെ പേര് നൽകുക (കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ).'
          : 'Please enter your full name (at least 2 characters).'
      );
      return;
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError(
        lang === 'ml'
          ? 'ദയവായി 10 അക്ക സാധുവായ മൊബൈൽ നമ്പർ നൽകുക.'
          : 'Please enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    if (!Number.isFinite(numericQty) || numericQty <= 0 || numericQty > 500) {
      setError(
        lang === 'ml'
          ? 'ദയവായി 0-ൽ കൂടുതൽ (പരമാവധി 500 ലിറ്റർ) അളവ് നൽകുക.'
          : 'Please enter a quantity greater than 0 (up to 500 liters).'
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1E2038]/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#F8F7F0] border border-[#282B4A]/18 shadow-2xl text-[#282B4A] pb-[env(safe-area-inset-bottom,0px)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-[#F8F7F0]/95 backdrop-blur-md border-b border-[#282B4A]/12">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-[#282B4A] text-[#F8F7F0] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="open-order-modal-title"
                className="text-base font-extrabold text-[#1E2038] truncate font-ml"
              >
                {lang === 'ml'
                  ? 'ഓർഡർ നൽകുക / Place Order'
                  : 'Place Order / ഓർഡർ നൽകുക'}
              </h2>
              <p className="text-[11px] text-[#5A5E7D] font-medium">
                {lang === 'ml'
                  ? 'ഓർഡർ കോഡ് ആവശ്യമില്ല • No Order Code Required'
                  : 'No Order Code Required • ഓർഡർ കോഡ് ആവശ്യമില്ല'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[#EEEBDA] hover:bg-[#282B4A]/10 text-[#282B4A] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receipt ? (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="rounded-2xl bg-[#EEEBDA]/85 border border-[#282B4A]/14 p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#282B4A] text-[#F8F7F0] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E2038] font-ml">
                ഓർഡർ അപേക്ഷ ലഭിച്ചു! / Order Request Received!
              </h3>
              <p className="text-xs sm:text-sm text-[#282B4A] leading-relaxed font-ml">
                താങ്കളുടെ ഓർഡർ അപേക്ഷ ലഭിച്ചിട്ടുണ്ട്! ഡിവിഷൻ കമ്മിറ്റി പരിശോധിച്ച്
                ഉടൻ ഉറപ്പാക്കുന്നതാണ്.
              </p>
              <p className="text-xs text-[#5A5E7D] leading-relaxed">
                Your order request has been received and will be confirmed
                shortly by the Division Committee.
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 border border-[#282B4A]/12 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5A5E7D]">പേര് / Name</span>
                <span className="font-bold text-[#1E2038]">
                  {receipt.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5E7D]">ഫോൺ / Mobile</span>
                <span className="font-bold text-[#1E2038] num">
                  +91 {receipt.mobile}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5E7D]">അളവ് / Quantity</span>
                <span className="font-bold text-[#1E2038] num">
                  {formatQuantity(receipt.quantity)} L
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5E7D]">തുക / Total Amount</span>
                <span className="font-extrabold text-[#1E2038] num">
                  {formatCurrency(receipt.total_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5E7D]">യൂണിറ്റ് / Unit</span>
                <span className="font-semibold text-[#282B4A]">
                  {receipt.unit_name ?? 'തിരഞ്ഞെടുത്തിട്ടില്ല / Not Selected'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handlePlaceAnother}
                className="flex-1 h-11 rounded-2xl bg-[#282B4A] hover:bg-[#1E2038] text-[#F8F7F0] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-sm font-ml"
              >
                <PlusCircle className="w-4 h-4" />
                <span>മറ്റൊരു ഓർഡർ നൽകുക / Place Another Order</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-5 rounded-2xl bg-[#EEEBDA] hover:bg-[#282B4A]/10 text-[#1E2038] text-sm font-bold transition-colors"
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
                className="block text-xs font-bold text-[#1E2038] font-ml"
              >
                പേര് / Full Name <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#5A5E7D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="open-order-name"
                  type="text"
                  required
                  maxLength={100}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ഉദാ: മുഹമ്മദ് അലി / e.g. Muhammed Ali"
                  className="w-full h-11 pl-10 pr-3.5 rounded-2xl bg-white border border-[#282B4A]/18 text-sm text-[#1E2038] placeholder:text-[#5A5E7D]/60 focus:outline-none focus:ring-2 focus:ring-[#282B4A]/25 focus:border-[#282B4A]"
                />
              </div>
            </div>

            {/* 2. Mobile Number */}
            <div className="space-y-1.5">
              <label
                htmlFor="open-order-mobile"
                className="block text-xs font-bold text-[#1E2038] font-ml"
              >
                ഫോൺ നമ്പർ / Mobile Number <span className="text-red-600">*</span>
              </label>
              <div className="relative flex items-center">
                <Phone className="w-4 h-4 text-[#5A5E7D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <span className="absolute left-10 text-xs font-bold text-[#5A5E7D] select-none">
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
                  className="w-full h-11 pl-[4.4rem] pr-3.5 rounded-2xl bg-white border border-[#282B4A]/18 text-sm font-semibold num text-[#1E2038] placeholder:text-[#5A5E7D]/55 focus:outline-none focus:ring-2 focus:ring-[#282B4A]/25 focus:border-[#282B4A]"
                />
              </div>
            </div>

            {/* 3. Quantity (Liters) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="open-order-qty"
                  className="block text-xs font-bold text-[#1E2038] font-ml"
                >
                  എത്ര ലിറ്റർ / Quantity (Liters){' '}
                  <span className="text-red-600">*</span>
                </label>
                <span className="text-[11px] font-bold text-[#5A5E7D] num">
                  {formatCurrency(perLiterRate)} / L
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_LITER_CHIPS.map((chip) => {
                  const active = Number(quantity) === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setQuantity(String(chip))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold num transition-colors ${
                        active
                          ? 'bg-[#282B4A] text-[#F8F7F0] shadow-xs'
                          : 'bg-[#EEEBDA] text-[#282B4A] hover:bg-[#282B4A]/12 border border-[#282B4A]/12'
                      }`}
                    >
                      {chip}L
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="open-order-qty"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={500}
                  step="0.5"
                  required
                  value={quantity}
                  onKeyDown={blockNegativeNumericKeys}
                  onChange={(e) =>
                    setQuantity(sanitizePositiveDecimal(e.target.value))
                  }
                  className="w-28 h-11 px-3.5 rounded-2xl bg-white border border-[#282B4A]/18 text-sm font-extrabold num text-[#1E2038] focus:outline-none focus:ring-2 focus:ring-[#282B4A]/25 focus:border-[#282B4A]"
                />
                <div className="flex-1 h-11 px-3.5 rounded-2xl bg-[#EEEBDA]/85 border border-[#282B4A]/12 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#5A5E7D] font-ml">
                    ആകെ തുക / Total
                  </span>
                  <span className="text-sm font-extrabold text-[#1E2038] num">
                    {formatCurrency(computedTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Optional Unit Selection */}
            <div className="rounded-2xl bg-[#EEEBDA]/65 border border-[#282B4A]/12 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#282B4A] shrink-0" />
                <span className="text-xs font-bold text-[#1E2038] font-ml">
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
              <p className="text-[11px] text-[#5A5E7D] font-ml">
                യൂണിറ്റ് അറിയില്ലെങ്കിൽ തിരഞ്ഞെടുക്കാതെ തന്നെ ഓർഡർ നൽകാം.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-2xl bg-[#282B4A] hover:bg-[#1E2038] disabled:opacity-60 text-[#F8F7F0] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors shadow-md font-ml"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>സമർപ്പിക്കുന്നു... / Submitting...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
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
