import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
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
import type { PublicSectorOption, PublicUnitOption } from '../../types';
import { formatCurrency, formatQuantity } from '../../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveInteger,
} from '../../utils/inputGuards';

interface OpenPublicOrderModalProps {
  perLiterRate: number;
  initialSectors?: PublicSectorOption[];
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

async function fetchPublicUnitOptions(): Promise<{
  sectors: PublicSectorOption[];
  units: PublicUnitOption[];
}> {
  // 1. Prefer same-origin Cloudflare Pages proxy (/api/public/unit-options)
  try {
    const res = await fetch('/api/public/unit-options', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.toLowerCase().includes('application/json')) {
      const parsed = (await res.json()) as {
        sectors?: PublicSectorOption[];
        units?: PublicUnitOption[];
      };
      if (Array.isArray(parsed.sectors) && Array.isArray(parsed.units)) {
        return { sectors: parsed.sectors, units: parsed.units };
      }
    }
  } catch {
    // Fall back to direct Supabase RPC (local Vite dev)
  }

  // 2. Direct Supabase RPC fallback
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase.rpc('get_public_unit_options');
  if (!error && data) {
    const parsed = data as {
      sectors?: PublicSectorOption[];
      units?: PublicUnitOption[];
    };
    return {
      sectors: Array.isArray(parsed.sectors) ? parsed.sectors : [],
      units: Array.isArray(parsed.units) ? parsed.units : [],
    };
  }

  // 3. Fallback via /api/public/leaderboard?limit=100 if unit-options unavailable
  const lbRes = await fetch('/api/public/leaderboard?page=1&limit=100', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (lbRes.ok) {
    const lb = (await lbRes.json()) as {
      sectors?: Array<{ id: number; name: string }>;
      items?: Array<{ id: number; name: string; sector_id: number }>;
      units?: Array<{ id: number; name: string; sector_id: number }>;
    };
    const rawUnits = lb.items ?? lb.units ?? [];
    return {
      sectors: (lb.sectors ?? []).map((s) => ({ id: s.id, name: s.name })),
      units: rawUnits.map((u) => ({
        id: u.id,
        name: u.name,
        sector_id: u.sector_id,
      })),
    };
  }

  return { sectors: [], units: [] };
}

async function submitPublicOrder(payload: {
  p_customer_name: string;
  p_mobile: string;
  p_quantity: number;
  p_unit_id: number | null;
}): Promise<SubmittedReceipt> {
  // 1. Prefer same-origin Cloudflare Pages proxy (/api/public/order-request)
  try {
    const res = await fetch('/api/public/order-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.toLowerCase().includes('application/json')) {
      const json = (await res.json()) as SubmittedReceipt & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          json.error || 'Unable to submit your order request.'
        );
      }
      return json;
    }
  } catch (err) {
    if (
      err instanceof Error &&
      !err.message.toLowerCase().includes('failed to fetch') &&
      !err.message.toLowerCase().includes('networkerror')
    ) {
      throw err;
    }
  }

  // 2. Direct Supabase RPC fallback (local Vite dev)
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase.rpc(
    'submit_public_order_request',
    payload
  );
  if (error) {
    throw new Error(error.message || 'Unable to submit your order request.');
  }
  return data as SubmittedReceipt;
}

export default function OpenPublicOrderModal({
  perLiterRate,
  initialSectors = [],
  onClose,
}: OpenPublicOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  const [sectors, setSectors] = useState<PublicSectorOption[]>(initialSectors);
  const [units, setUnits] = useState<PublicUnitOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmittedReceipt | null>(null);
  const [pushAttached, setPushAttached] = useState(false);
  const [pushEligible, setPushEligible] = useState(false);
  const [pushSubscribing, setPushSubscribing] = useState(false);
  const [pushMsgError, setPushMsgError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      try {
        const opts = await fetchPublicUnitOptions();
        if (!active) return;
        if (opts.sectors.length > 0) setSectors(opts.sectors);
        if (opts.units.length > 0) setUnits(opts.units);
      } catch {
        // Keep initialSectors if network fails
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

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  const filteredUnits = useMemo(() => {
    const base =
      sectorFilter === 'ALL'
        ? units
        : units.filter((u) => String(u.sector_id) === sectorFilter);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [units, sectorFilter]);

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
    setPushAttached(false);
    setPushEligible(false);
    setPushMsgError(null);
  };

  const handleEnableReceiptPush = async () => {
    if (!receipt || pushSubscribing) return;
    setPushMsgError(null);
    setPushSubscribing(true);
    try {
      const mod = await import('../../utils/pushNotifications');
      const res = await mod.subscribeOpenOrderPush(receipt.id);
      if (res.ok) {
        setPushAttached(true);
        setPushEligible(false);
      } else {
        setPushMsgError(
          res.error || 'നോട്ടിഫിക്കേഷൻ ഓൺ ചെയ്യാൻ കഴിഞ്ഞില്ല.'
        );
      }
    } catch (err) {
      setPushMsgError(
        err instanceof Error ? err.message : 'Unable to enable notifications.'
      );
    } finally {
      setPushSubscribing(false);
    }
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
      const res = await submitPublicOrder({
        p_customer_name: cleanName,
        p_mobile: cleanMobile,
        p_quantity: numericQty,
        p_unit_id: unitIdNum,
      });
      setReceipt(res);

      // Remember request ID locally and auto-attach if already opted in
      void import('../../utils/pushNotifications')
        .then(async (mod) => {
          mod.rememberOpenOrderRequestId(res.id);
          const supported =
            mod.isPushSupported() && !mod.isIosNonStandalone();
          const perm = mod.getNotificationPermission();
          if (supported && perm !== 'denied') {
            const attached = await mod.attachExistingOpenOrderPush(res.id);
            if (attached) {
              setPushAttached(true);
              setPushEligible(false);
            } else {
              setPushEligible(true);
            }
          }
        })
        .catch(() => undefined);
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
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 glass-crimson text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-white/15 border border-white/25 text-[#FCE36D] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="open-order-modal-title"
                className="text-sm sm:text-base font-extrabold text-white truncate font-ml"
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
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receipt ? (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="rounded-2xl bg-white border border-[#5C0A0E]/14 p-5 text-center space-y-2.5 shadow-xs">
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

            {pushAttached && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-start gap-2.5 text-left">
                <Bell className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-emerald-900 leading-relaxed font-ml">
                  ഓർഡർ സ്വീകരിക്കുമ്പോൾ ഉടൻ നോട്ടിഫിക്കേഷൻ ലഭിക്കും / You&apos;ll
                  be notified immediately once approved.
                </p>
              </div>
            )}

            {!pushAttached && pushEligible && (
              <div className="rounded-2xl bg-white border border-[#5C0A0E]/16 p-3.5 space-y-2.5 text-left shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-xl glass-crimson-solid text-[#FCE36D] flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </span>
                  <p className="text-xs text-[#4A070A] leading-relaxed font-ml">
                    ഇത് ഓൺ ആക്കി വെച്ചാൽ, നിങ്ങളുടെ ഓർഡർ ഡിവിഷൻ കമ്മിറ്റി
                    സ്വീകരിക്കുമ്പോൾ അപ്പോൾ തന്നെ അറിയിപ്പ് ലഭിക്കും. മറ്റു
                    നോട്ടിഫിക്കേഷനുകൾ ഒന്നും വരില്ല.
                  </p>
                </div>
                {pushMsgError && (
                  <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5 font-ml">
                    {pushMsgError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={pushSubscribing}
                  onClick={() => void handleEnableReceiptPush()}
                  className="w-full h-10 rounded-xl glass-crimson-solid hover:opacity-95 disabled:opacity-65 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-opacity font-ml"
                >
                  {pushSubscribing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>സജ്ജീകരിക്കുന്നു...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5 text-[#FCE36D]" />
                      <span>അറിയിപ്പ് ഓൺ ചെയ്യുക / Notify on Approval</span>
                    </>
                  )}
                </button>
              </div>
            )}

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
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5">
            {error && (
              <div
                role="alert"
                className="rounded-2xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-800"
              >
                {error}
              </div>
            )}

            {/* 1. Full Name */}
            <div className="space-y-1">
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
                  className="w-full h-10 pl-10 pr-3.5 rounded-2xl bg-white border border-[#5C0A0E]/20 text-sm text-[#2B0406] placeholder:text-[#7A2E33]/55 focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
              </div>
            </div>

            {/* 2. Mobile Number */}
            <div className="space-y-1">
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
                  className="w-full h-10 pl-[4.4rem] pr-3.5 rounded-2xl bg-white border border-[#5C0A0E]/20 text-sm font-semibold num text-[#2B0406] placeholder:text-[#7A2E33]/50 focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
              </div>
            </div>

            {/* 3. Quantity (Whole Liters Only: 1L, 2L, 3L...) */}
            <div className="space-y-1.5">
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
                      className={`py-1.5 rounded-xl text-xs font-extrabold num transition-colors ${
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
                  className="w-10 h-10 rounded-2xl bg-white border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-[#5C0A0E]/5 disabled:opacity-40 shrink-0"
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
                  className="w-20 h-10 px-2 text-center rounded-2xl bg-white border border-[#5C0A0E]/20 text-base font-extrabold num text-[#2B0406] focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                />
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={submitting}
                  aria-label="Increase quantity"
                  className="w-10 h-10 rounded-2xl bg-white border border-[#5C0A0E]/20 flex items-center justify-center text-[#5C0A0E] hover:bg-[#5C0A0E]/5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="flex-1 h-10 px-3.5 rounded-2xl bg-[#5C0A0E]/[0.06] border border-[#5C0A0E]/12 flex items-center justify-between">
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

            {/* 4. Optional Unit Selection (Crisp Native Selects — zero clipping, instant interaction) */}
            <div className="rounded-2xl bg-white border border-[#5C0A0E]/16 p-3 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#2B0406] font-ml inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#C40E16] shrink-0" />
                  <span>യൂണിറ്റ് (ഓപ്ഷണൽ) / Unit (Optional)</span>
                </span>
                {optionsLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5C0A0E] shrink-0" />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <select
                    aria-label="Optional Sector Filter"
                    value={sectorFilter}
                    onChange={(e) => handleSectorChange(e.target.value)}
                    className="w-full h-10 pl-3 pr-8 rounded-xl bg-[#FFF8F6] border border-[#5C0A0E]/20 text-xs font-semibold text-[#2B0406] appearance-none focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                  >
                    <option value="ALL">എല്ലാ സെക്ടറുകളും / All Sectors</option>
                    {sortedSectors.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#5C0A0E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    aria-label="Optional Unit Selection"
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full h-10 pl-3 pr-8 rounded-xl bg-[#FFF8F6] border border-[#5C0A0E]/20 text-xs font-semibold text-[#2B0406] appearance-none focus:outline-none focus:ring-2 focus:ring-[#5C0A0E]/20 focus:border-[#5C0A0E]"
                  >
                    <option value="">
                      തിരഞ്ഞെടുത്തിട്ടില്ല / Not Selected (Optional)
                    </option>
                    {filteredUnits.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#5C0A0E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <p className="text-[11px] text-[#7A2E33] font-ml">
                യൂണിറ്റ് അറിയില്ലെങ്കിൽ തിരഞ്ഞെടുക്കാതെ തന്നെ ഓർഡർ നൽകാം.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-2xl glass-crimson-solid hover:opacity-95 disabled:opacity-60 text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-opacity shadow-md font-ml"
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
