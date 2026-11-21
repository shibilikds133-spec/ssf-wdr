import type { PaymentMode, PaymentStatus } from '../types';
import { formatCurrency, formatQuantity } from './format';

export interface WhatsAppReceiptParams {
  contributorName: string;
  mobileNumber: string;
  unitName: string;
  quantity: number;
  totalAmount: number;
  paymentStatus?: PaymentStatus;
  paymentMode: PaymentMode | null;
  challengeTitle: string;
}

export function buildWhatsAppReceiptUrl(
  params: WhatsAppReceiptParams
): string {
  const digits = params.mobileNumber.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const status: PaymentStatus = params.paymentStatus ?? 'PAID';
  const paymentLabel =
    status === 'UNPAID'
      ? 'Unpaid (Pending)'
      : `Paid (${params.paymentMode === 'CASH' ? 'Cash Handover' : 'UPI'})`;

  const message = [
    `*${params.challengeTitle}*`,
    'Official Payasam Order Receipt',
    '━━━━━━━━━━━━━━',
    `*Ordered By:* ${params.contributorName}`,
    `*Unit:* ${params.unitName}`,
    `*Quantity:* ${formatQuantity(params.quantity)} L`,
    `*Amount:* ${formatCurrency(params.totalAmount)}`,
    `*Payment:* ${paymentLabel}`,
    '━━━━━━━━━━━━━━',
    'Jazakallahu Khairan! Thank you for your Payasam order.',
  ].join('\n');

  return `https://wa.me/91${last10}?text=${encodeURIComponent(message)}`;
}

export interface CredentialShareParams {
  role: 'SECTOR' | 'UNIT';
  accountName: string;
  username: string;
  loginCode: string;
  passwordToShare: string;
  contactPhone?: string;
}

function normalizeWhatsAppPhone(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

export function buildCredentialShareText(
  params: CredentialShareParams
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const loginUrl = `${origin}/login?uid=${encodeURIComponent(params.username)}`;
  const roleLabel = params.role === 'SECTOR' ? 'Sector' : 'Unit';

  const lines = [
    `*SSF Wandoor — ${roleLabel} Login*`,
    `${roleLabel}: ${params.accountName}`,
    `User ID: ${params.username}`,
    `Password: ${params.passwordToShare}`,
  ];

  if (params.role === 'UNIT') {
    lines.push(`Order Code: ${params.loginCode}`);
  }

  lines.push(`Login: ${loginUrl}`);
  return lines.join('\n');
}

export function buildCredentialShareUrl(
  params: CredentialShareParams
): string {
  const msg = buildCredentialShareText(params);
  const cleanPhone = normalizeWhatsAppPhone(params.contactPhone);

  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
