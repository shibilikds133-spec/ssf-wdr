import { RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { SsfLogo } from '../components/SsfLogo';
import { useRegisterPageDocs } from '../context/DocsContext';
import { usePublicStats } from '../hooks/usePublicStats';
import { formatQuantity } from '../utils/format';

export default function PublicPage() {
  const { data, loading, error, refresh } = usePublicStats();

  useRegisterPageDocs('public_leaderboard', { theme: 'plum' });

  return (
    <AppLayout>
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">
            Public Dashboard — Ready for Phase 4
          </h1>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        <div className="inline-flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
          <span className="text-slate-500">Live Connection Test:</span>
          {loading && !data ? (
            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
              <SsfLogo animated className="w-4 h-auto" />
              Connecting...
            </span>
          ) : error ? (
            <span className="text-rose-600 font-medium">{error}</span>
          ) : data ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              Total Quantity:{' '}
              <span className="num font-semibold">
                {formatQuantity(Number(data.division.total_quantity))}
              </span>
            </span>
          ) : (
            <span className="text-slate-500">No data available</span>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
