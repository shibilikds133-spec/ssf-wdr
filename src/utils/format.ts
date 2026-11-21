export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) && amount !== 0 ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(safe)
    .replace(/\.00$/, '');
}

export function formatQuantity(qty: number): string {
  const safe = Number.isFinite(qty) && qty !== 0 ? qty : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Share of the Division Order Limit represented by `quantity`, as a percentage.
 * Never returns NaN/Infinity: a missing or non-positive limit yields 0.
 */
export function calcLimitSharePercent(
  quantity: number,
  divisionLimit: number
): number {
  const qty = Number(quantity);
  const limit = Number(divisionLimit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return (qty / limit) * 100;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const day = getPart('day');
  const month = getPart('month');
  const hour = getPart('hour');
  const minute = getPart('minute');
  const dayPeriod = getPart('dayPeriod').toUpperCase();

  return `${day} ${month}, ${hour}:${minute} ${dayPeriod}`.trim();
}

/**
 * Share of Sector total quantity represented by a unit, as a percentage.
 * Safe from division-by-zero: non-positive sectorTotal yields 0.
 */
export function calcSectorUnitSharePercent(
  unitQty: number,
  sectorTotalQty: number
): number {
  const uQty = Number(unitQty);
  const sQty = Number(sectorTotalQty);
  if (!Number.isFinite(sQty) || sQty <= 0) return 0;
  if (!Number.isFinite(uQty) || uQty <= 0) return 0;
  return (uQty / sQty) * 100;
}
