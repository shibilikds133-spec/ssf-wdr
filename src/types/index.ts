export type UserRole = 'ADMIN' | 'SECTOR' | 'UNIT';
export type PaymentStatus = 'PAID' | 'UNPAID';
export type PaymentMode = 'CASH' | 'UPI';

export interface AuthSession {
  role: 'ADMIN' | 'SECTOR' | 'UNIT';
  code: string; // Sliding 14-day HS256 JWT (passed as `p_code` to RPCs)
  token?: string;
  login_code: string; // Permanent display/order code (WDR100, WDR101, WDR1)
  username: string;
  name: string;
  sector_name?: string;
  entity_id?: number;
  must_change_password: boolean;
  expires_at?: string;
}

export interface LoginDirectoryItem {
  username: string;
  display_name: string;
  role: 'ADMIN' | 'SECTOR' | 'UNIT';
  subtitle: string;
}

export interface PasswordResetRequest {
  id: number;
  account_type: 'SECTOR' | 'UNIT';
  account_id: number;
  account_name: string;
  username: string;
  login_code: string;
  contact_phone: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  requested_at: string;
}

export interface AppSettings {
  unit_rate: number;
  division_target: number;
  challenge_title: string;
  is_challenge_open: boolean;
}

export interface PublicDivisionSummary {
  total_entries: number;
  total_quantity: number;
  total_amount: number;
  total_units: number;
  active_units: number;
}

export interface PublicSectorRank {
  id: number;
  name: string;
  total_units: number;
  active_units: number;
  total_entries: number;
  total_quantity: number;
  total_amount: number;
}

export interface PublicUnitRank {
  id: number;
  name: string;
  sector_id: number;
  sector_name: string;
  total_entries: number;
  total_quantity: number;
  total_amount: number;
}

export interface PublicStatsResponse {
  settings: AppSettings;
  division: PublicDivisionSummary;
  sectors: PublicSectorRank[];
  units: PublicUnitRank[];
  fetched_at: string;
}

export interface EntryItem {
  id: number;
  unit_id?: number | null;
  unit_name?: string;
  sector_id?: number | null;
  sector_name?: string;
  is_division_direct?: boolean;
  contributor_name: string;
  mobile_number: string;
  quantity: number;
  unit_rate_applied: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode | null;
  created_at: string;
}

export interface UnitSummaryRow {
  id: number;
  name: string;
  login_code: string;
  username?: string;
  contact_phone?: string;
  must_change_password?: boolean;
  has_custom_password?: boolean;
  sector_id?: number;
  sector_name?: string;
  sector_code?: string;
  total_entries: number;
  total_quantity: number;
  cash_amount: number;
  upi_amount: number;
  paid_amount?: number;
  unpaid_amount?: number;
  unpaid_entries?: number;
  total_amount: number;
}

export interface CsvImportRow {
  sector_name: string;
  sector_code: string;
  unit_name: string;
  unit_code: string;
  sector_phone?: string;
  unit_phone?: string;
}

export interface SectorOption {
  id: number;
  name: string;
  login_code: string;
  username?: string;
  contact_phone?: string;
  must_change_password?: boolean;
  has_custom_password?: boolean;
}

export interface AdminSummary {
  total_units: number;
  total_entries: number;
  total_quantity: number;
  cash_amount: number;
  upi_amount: number;
  paid_amount?: number;
  unpaid_amount?: number;
  unpaid_entries?: number;
  total_amount: number;
  division_direct_entries?: number;
  division_direct_quantity?: number;
  division_direct_amount?: number;
}

export interface AdminDashboardResponse {
  settings: AppSettings;
  summary: AdminSummary;
  sectors: SectorOption[];
  unit_summaries: UnitSummaryRow[];
  entries: EntryItem[];
  pending_reset_requests?: PasswordResetRequest[];
}

export interface SectorDashboardSummary {
  total_units: number;
  total_entries: number;
  total_quantity: number;
  cash_amount: number;
  upi_amount: number;
  paid_amount?: number;
  unpaid_amount?: number;
  unpaid_entries?: number;
  total_amount: number;
}

export interface SectorDashboardResponse {
  sector: {
    id: number;
    name: string;
    login_code: string;
  };
  settings: AppSettings;
  summary: SectorDashboardSummary;
  units: UnitSummaryRow[];
  entries: EntryItem[];
}

export interface UnitDashboardResponse {
  unit: {
    id: number;
    name: string;
    username: string;
    login_code: string;
    contact_phone: string;
    sector_id: number;
    sector_name: string;
  };
  settings: AppSettings;
  summary: {
    total_entries: number;
    total_quantity: number;
    cash_amount: number;
    upi_amount: number;
    paid_amount?: number;
    unpaid_amount?: number;
    unpaid_entries?: number;
    total_amount: number;
  };
  entries: EntryItem[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FilteredUnitTotals {
  total_entries: number;
  total_quantity: number;
  cash_amount: number;
  upi_amount: number;
  unpaid_amount: number;
  total_amount: number;
}

export interface PaginatedUnitsResponse extends PaginatedResponse<UnitSummaryRow> {
  totals: FilteredUnitTotals;
}

export interface CredentialAccountRow {
  account_type: 'SECTOR' | 'UNIT';
  account_id: number;
  sector_id: number;
  sector_name: string;
  name: string;
  subtitle: string;
  username: string;
  login_code: string;
  contact_phone: string;
  must_change_password: boolean;
  has_custom_password: boolean;
  is_reset_pending: boolean;
}
