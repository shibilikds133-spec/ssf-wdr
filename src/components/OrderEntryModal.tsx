import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { isSessionExpiredError } from '../context/AuthContext';
import { clearCached } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type {
  PaymentMode,
  PaymentStatus,
  SectorOption,
  UnitSummaryRow,
} from '../types';
import { formatCurrency, formatQuantity } from '../utils/format';
import {
  blockNegativeNumericKeys,
  sanitizePositiveDecimal,
  sanitizePositiveInteger,
} from '../utils/inputGuards';
import { notifyOrderCreated } from '../utils/pushNotifications';
import { buildWhatsAppReceiptUrl } from '../utils/whatsapp';

interface OrderEntryModalProps {
  mode: 'UNIT' | 'ADMIN';
  authCode: string;
  isDesktop: boolean;
  unitRate: number;
  challengeTitle: string;
  unitName?: string;
  unitCode?: string;
  sectors?: SectorOption[];
  units?: UnitSummaryRow[];
  onClose: () => void;
  onOrderCreated: () => Promise<void>;
  onSessionExpired?: (msg?: string) => void;
}

const QUICK_LITERS = [1, 2, 3, 5, 10] as const;

interface CreatedReceipt {
  id: number;
  contributor_name: string;
  mobile_number: string;
  unit_name: string;
  quantity: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode | null;
}

export function OrderEntryModal({
  mode,
  authCode,
  isDesktop,
  unitRate,
  challengeTitle,
  unitName,
  unitCode,
  sectors = [],
  units = [],
  onClose,
  onOrderCreated,
  onSessionExpired,
}: OrderEntryModalProps) {
  const isUnit = mode === 'UNIT';

  // Admin target channel
  const [adminTargetMode, setAdminTargetMode] = useState<'DIRECT' | 'UNIT'>(
    'DIRECT'
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [unitSearch, setUnitSearch] = useState('');

  // Order fields
  const [contributorName, setContributorName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreatedReceipt | null>(null);

  const groupedUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    const sectorMap = new Map<number, string>();
    for (const s of sectors) {
      sectorMap.set(s.id, s.name);
    }

    const filtered = units.filter((u) => {
      if (!q) return true;
      return `${u.name} ${u.login_code} ${u.sector_name ?? ''}`
        .toLowerCase()
        .includes(q);
    });

    const groups = new Map<string, UnitSummaryRow[]>();
    for (const u of filtered) {
      const sName =
        u.sector_name ||
        (typeof u.sector_id === 'number' ? sectorMap.get(u.sector_id) : undefined) ||
        'Units';
      const arr = groups.get(sName) ?? [];
      arr.push(u);
      groups.set(sName, arr);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sectorTitle, items]) => ({
        sectorTitle,
        items: items.sort((a, b) =>
          a.login_code.localeCompare(b.login_code, undefined, { numeric: true })
        ),
      }));
  }, [units, sectors, unitSearch]);

  const parsedQty = Number.parseFloat(quantity);
  const safeQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 0;
  const previewTotal = Math.round(safeQty * unitRate * 100) / 100;

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const cleanName = contributorName.trim();
    const cleanMobile = sanitizePositiveInteger(mobileNumber);

    if (!isUnit && adminTargetMode === 'UNIT' && !selectedUnitId) {
      setError('Please select a Unit or switch to Division Direct.');
      return;
    }

    if (!cleanName) {
      setError('Ordered by name is required.');
      return;
    }
    if (cleanMobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (paymentStatus === null) {
      setError('Please select Paid or Unpaid status.');
      return;
    }
    if (paymentStatus === 'PAID' && paymentMethod === null) {
      setError('Please select Cash Handover or UPI for Paid orders.');
      return;
    }

    setSubmitting(true);
    try {
      const rpcName = isUnit ? 'unit_add_entry' : 'admin_add_entry';
      const rpcArgs = isUnit
        ? {
            p_code: authCode,
            p_contributor_name: cleanName,
            p_mobile_number: cleanMobile,
            p_quantity: parsedQty,
            p_payment_status: paymentStatus,
            p_payment_mode: paymentStatus === 'PAID' ? paymentMethod : null,
          }
        : {
            p_code: authCode,
            p_unit_id:
              adminTargetMode === 'DIRECT' ? null : Number(selectedUnitId),
            p_contributor_name: cleanName,
            p_mobile_number: cleanMobile,
            p_quantity: parsedQty,
            p_payment_status: paymentStatus,
            p_payment_mode: paymentStatus === 'PAID' ? paymentMethod : null,
          };

      const { data: created, error: rpcError } = await supabase.rpc(
        rpcName,
        rpcArgs
      );

      if (rpcError) {
        if (isSessionExpiredError(rpcError.message)) {
          onSessionExpired?.();
          return;
        }
        setError(rpcError.message || 'Unable to submit order.');
        return;
      }

      const res = created as {
        id: number;
        unit_name?: string;
        contributor_name: string;
        mobile_number: string;
        quantity: number;
        total_amount: number;
        payment_status: PaymentStatus;
        payment_mode: PaymentMode | null;
      };

      setReceipt({
        id: res.id,
        contributor_name: res.contributor_name,
        mobile_number: res.mobile_number,
        unit_name: res.unit_name || unitName || 'Division Direct',
        quantity: Number(res.quantity),
        total_amount: Number(res.total_amount),
        payment_status: res.payment_status,
        payment_mode: res.payment_mode,
      });

      if (typeof res?.id === 'number' && res.id > 0) {
        notifyOrderCreated(res.id, 'portal');
      }

      clearCached('wdr_public_stats_v1');
      await onOrderCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReceiptWhatsApp = () => {
    if (!receipt) return;
    const url = buildWhatsAppReceiptUrl({
      contributorName: receipt.contributor_name,
      mobileNumber: receipt.mobile_number,
      unitName: receipt.unit_name,
      quantity: receipt.quantity,
      totalAmount: receipt.total_amount,
      paymentStatus: receipt.payment_status,
      paymentMode: receipt.payment_mode,
      challengeTitle,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const primaryBtnClass = isUnit
    ? 'glass-orange text-white hover:opacity-95'
    : 'glass-plum text-white hover:opacity-95';
  const chipActiveClass = isUnit
    ? 'glass-orange text-white border-transparent shadow-xs'
    : 'glass-plum text-white border-transparent shadow-xs';
  const borderClass = isUnit ? 'border-cream-border' : 'border-milk-border';
  const surfaceClass = isUnit ? 'bg-cream-50' : 'bg-milk-50';
  const headingColor = isUnit ? 'text-ember-950' : 'text-plum-950';
  const subTextColor = isUnit ? 'text-ember-900/75' : 'text-ink-600';
  const cardSurfaceClass = isUnit ? 'glass-cream-card' : 'glass-card';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-entry-modal-title"
      className={
        isDesktop
          ? 'fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-md flex items-center justify-center p-4'
          : 'fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-md flex items-end justify-center'
      }
    >
      <div
        className={
          isDesktop
            ? `${cardSurfaceClass} bg-white/95 max-w-lg w-full rounded-2xl border ${borderClass} p-6 shadow-2xl max-h-[92vh] overflow-y-auto`
            : `${cardSurfaceClass} bg-white/98 w-full max-w-xl rounded-t-2xl border-t ${borderClass} p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl max-h-[92vh] overflow-y-auto`
        }
      >
        {!isDesktop && (
          <div className={`w-10 h-1 rounded-full ${isUnit ? 'bg-cream-border' : 'bg-milk-border'} mx-auto mb-3`} />
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="order-entry-modal-title"
              className={`text-base sm:text-lg font-bold ${headingColor}`}
            >
              {isUnit ? 'Quick Unit Order' : 'Add Division / Unit Order'}
            </h2>
            <p className={`text-xs ${subTextColor} mt-0.5 num`}>
              {isUnit
                ? `${unitName ?? 'Unit'} (${unitCode ?? ''}) · ₹${formatQuantity(unitRate)} / L`
                : `Rate: ₹${formatQuantity(unitRate)} / L · Always open for Division Admin`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close order modal"
            className="p-1.5 rounded-lg text-ink-600 hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receipt ? (
          <div className="mt-5 space-y-4">
            <div className="bg-vibrant-tealSoft/60 border border-vibrant-teal/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-vibrant-teal font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Order #{receipt.id} Confirmed</span>
              </div>
              <div className="text-sm font-bold text-ink-900">
                {receipt.contributor_name}
              </div>
              <div className="flex items-center justify-between text-xs text-ink-600 num">
                <span>
                  {receipt.unit_name} · {formatQuantity(receipt.quantity)} L
                </span>
                <span className="text-sm font-extrabold text-ink-900">
                  {formatCurrency(receipt.total_amount)}
                </span>
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    receipt.payment_status === 'UNPAID'
                      ? 'bg-vibrant-coralSoft text-vibrant-coral'
                      : receipt.payment_mode === 'UPI'
                      ? 'bg-vibrant-tealSoft text-vibrant-teal'
                      : 'bg-vibrant-amberSoft text-vibrant-amber'
                  }`}
                >
                  {receipt.payment_status === 'UNPAID'
                    ? 'Unpaid'
                    : `Paid • ${
                        receipt.payment_mode === 'CASH'
                          ? 'Cash Handover'
                          : 'UPI'
                      }`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openReceiptWhatsApp}
              className="w-full py-2.5 px-4 rounded-xl bg-vibrant-teal text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Send WhatsApp Receipt
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={resetForAnother}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold border ${borderClass} ${surfaceClass} ${headingColor} hover:bg-white transition-colors`}
              >
                Add Another Order
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold ${primaryBtnClass} transition-opacity`}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Admin-Only Channel Selector */}
            {!isUnit && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-milk-100 border border-milk-border">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTargetMode('DIRECT');
                      setError(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      adminTargetMode === 'DIRECT'
                        ? 'glass-plum text-white shadow-xs'
                        : 'text-ink-600 hover:text-plum-900'
                    }`}
                  >
                    Division Direct (No Unit)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTargetMode('UNIT');
                      setError(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      adminTargetMode === 'UNIT'
                        ? 'glass-plum text-white shadow-xs'
                        : 'text-ink-600 hover:text-plum-900'
                    }`}
                  >
                    Assign to Unit
                  </button>
                </div>

                {adminTargetMode === 'DIRECT' ? (
                  <p className="text-[11px] text-ink-600 bg-milk-50 border border-milk-border rounded-xl px-3 py-2">
                    Recorded under Division totals only — will not appear in any
                    Unit or Sector portal.
                  </p>
                ) : (
                  <div className="space-y-1.5 bg-milk-50 border border-milk-border rounded-xl p-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                        placeholder="Search unit or sector..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-milk-border bg-white text-ink-900"
                      />
                    </div>
                    <select
                      aria-label="Select Unit"
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-milk-border bg-white text-ink-900 font-medium"
                    >
                      <option value="">-- Select a Unit --</option>
                      {groupedUnits.map((group) => (
                        <optgroup
                          key={group.sectorTitle}
                          label={group.sectorTitle}
                        >
                          {group.items.map((u) => (
                            <option key={u.id} value={String(u.id)}>
                              {u.name} ({u.login_code})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Ordered By & Mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="order-contributor-name"
                  className="block text-xs font-semibold text-ink-900 mb-1"
                >
                  Ordered By (Name) *
                </label>
                <input
                  id="order-contributor-name"
                  type="text"
                  required
                  placeholder="Full name"
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2 text-sm rounded-xl border ${borderClass} bg-white text-ink-900`}
                />
              </div>

              <div>
                <label
                  htmlFor="order-mobile-number"
                  className="block text-xs font-semibold text-ink-900 mb-1"
                >
                  Mobile Number *
                </label>
                <input
                  id="order-mobile-number"
                  type="tel"
                  required
                  inputMode="numeric"
                  maxLength={15}
                  placeholder="10-digit WhatsApp number"
                  value={mobileNumber}
                  onKeyDown={blockNegativeNumericKeys}
                  onChange={(e) =>
                    setMobileNumber(sanitizePositiveInteger(e.target.value))
                  }
                  disabled={submitting}
                  className={`w-full px-3 py-2 text-sm rounded-xl border ${borderClass} bg-white text-ink-900 num`}
                />
              </div>
            </div>

            {/* Modern Quantity Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="order-quantity"
                  className="block text-xs font-semibold text-ink-900"
                >
                  Quantity (Liters) *
                </label>
                <span className="text-xs font-bold text-ink-900 num">
                  {formatQuantity(safeQty)} L × ₹{formatQuantity(unitRate)} ={' '}
                  <span className={isUnit ? 'text-ember-700' : 'text-plum-900'}>
                    {formatCurrency(previewTotal)}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  disabled={submitting || safeQty <= 1}
                  aria-label="Decrease quantity"
                  className={`w-10 h-10 rounded-xl border ${borderClass} ${surfaceClass} flex items-center justify-center ${headingColor} disabled:opacity-40 hover:bg-white transition-colors shrink-0`}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="order-quantity"
                  type="text"
                  inputMode="decimal"
                  required
                  value={quantity}
                  onKeyDown={blockNegativeNumericKeys}
                  onChange={(e) =>
                    setQuantity(sanitizePositiveDecimal(e.target.value))
                  }
                  disabled={submitting}
                  className={`flex-1 px-3 py-2 text-center text-base font-extrabold rounded-xl border ${borderClass} bg-white text-ink-900 num`}
                />
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  disabled={submitting}
                  aria-label="Increase quantity"
                  className={`w-10 h-10 rounded-xl border ${borderClass} ${surfaceClass} flex items-center justify-center ${headingColor} hover:bg-white transition-colors shrink-0`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_LITERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(String(q))}
                    disabled={submitting}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all num ${
                      safeQty === q
                        ? chipActiveClass
                        : `${surfaceClass} ${borderClass} text-ink-900 hover:bg-white`
                    }`}
                  >
                    {q} L
                  </button>
                ))}
              </div>
            </div>

            {/* Step 1: Mandatory Payment Status (NO DEFAULT) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-900">
                  Payment Status *
                </span>
                <span className="text-[11px] text-ink-600">
                  Select payment status (Required)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPaymentStatus('PAID');
                    setError(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    paymentStatus === 'PAID'
                      ? 'bg-vibrant-tealSoft border-vibrant-teal text-vibrant-teal ring-2 ring-vibrant-teal/20'
                      : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Paid</div>
                    <div className="text-[10px] opacity-80">
                      Payment received
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPaymentStatus('UNPAID');
                    setPaymentMethod(null);
                    setError(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    paymentStatus === 'UNPAID'
                      ? 'bg-vibrant-amberSoft border-vibrant-amber text-vibrant-amber ring-2 ring-vibrant-amber/20'
                      : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Unpaid</div>
                    <div className="text-[10px] opacity-80">
                      Pay on delivery
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Payment Method (ONLY when Paid) */}
            {paymentStatus === 'PAID' && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-900">
                    Payment Method *
                  </span>
                  <span className="text-[11px] text-ink-600">
                    Select how payment was received (Required)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setPaymentMethod('CASH');
                      setError(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      paymentMethod === 'CASH'
                        ? chipActiveClass
                        : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Cash Handover</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setPaymentMethod('UPI');
                      setError(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      paymentMethod === 'UPI'
                        ? chipActiveClass
                        : `bg-white ${borderClass} text-ink-900 hover:bg-black/[0.02]`
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>UPI</span>
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={`px-4 py-2.5 text-xs font-semibold rounded-xl border ${borderClass} text-ink-600 hover:bg-black/[0.03] transition-colors`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2.5 text-xs font-semibold rounded-xl ${primaryBtnClass} disabled:opacity-50 transition-opacity shadow-sm inline-flex items-center gap-1.5`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving...' : 'Confirm Order'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
