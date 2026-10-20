import React, { useMemo, useState } from 'react';
import { IntervalAuditRecord, IntervalStatus } from '../engine/sgmaEngine';

interface IntervalLedgerTableProps {
  records: IntervalAuditRecord[];
  brokenSuctionCount: number;
  deadheadCount: number;
  cyclingCount: number;
  phantomAfPrevented: number;
}

export const IntervalLedgerTable: React.FC<IntervalLedgerTableProps> = ({
  records,
  brokenSuctionCount,
  deadheadCount,
  cyclingCount,
  phantomAfPrevented,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ANOMALIES' | IntervalStatus>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    for (const r of records) s.add(r.year_month);
    return Array.from(s).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter === 'ANOMALIES' && r.status === IntervalStatus.NORMAL) return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'ANOMALIES' &&
        r.status !== statusFilter
      ) {
        return false;
      }
      if (monthFilter !== 'ALL' && r.year_month !== monthFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchStart = r.interval_start.toLowerCase().includes(q);
        const matchNotes = (r.notes || '').toLowerCase().includes(q);
        const matchStatus = r.status.toLowerCase().includes(q);
        if (!matchStart && !matchNotes && !matchStatus) return false;
      }
      return true;
    });
  }, [records, statusFilter, monthFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageSlice = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDownloadCSV = () => {
    const headers = [
      'interval_start',
      'interval_end',
      'kwh',
      'kw_demand',
      'interpolated_swl_ft',
      'tdh_ft',
      'kwh_per_af',
      'calculated_af',
      'raw_unfiltered_af',
      'gallons',
      'flow_gpm',
      'status',
      'af_min_tier2',
      'af_expected_tier3',
      'af_max_tier1',
      'notes',
    ];
    const lines = [headers.join(',')];
    for (const r of filteredRecords) {
      lines.push(
        [
          r.interval_start,
          r.interval_end,
          r.kwh.toFixed(4),
          r.kw_demand.toFixed(2),
          r.interpolated_swl_ft.toFixed(2),
          r.tdh_ft.toFixed(2),
          r.kwh_per_af.toFixed(3),
          r.calculated_af.toFixed(6),
          r.raw_unfiltered_af.toFixed(6),
          r.gallons.toFixed(1),
          r.flow_gpm.toFixed(1),
          r.status,
          r.uncertainty_bracket.af_min.toFixed(6),
          r.uncertainty_bracket.af_expected.toFixed(6),
          r.uncertainty_bracket.af_max.toFixed(6),
          `"${(r.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sgma_forensic_interval_ledger_2026.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStatusLabel = (status: IntervalStatus) => {
    switch (status) {
      case IntervalStatus.NORMAL:
        return (
          <span className="text-emerald-700 font-medium whitespace-nowrap">
            ● Nominal Lift
          </span>
        );
      case IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE:
        return (
          <span className="text-amber-700 font-semibold whitespace-nowrap">
            ▲ Suction Loss / Idle
          </span>
        );
      case IntervalStatus.OVERLOAD_OR_DEADHEAD:
        return (
          <span className="text-rose-700 font-semibold whitespace-nowrap">
            ✖ Deadhead / Overload
          </span>
        );
      case IntervalStatus.INTERMITTENT_CYCLING:
        return (
          <span className="text-purple-700 font-semibold whitespace-nowrap">
            ◆ Short Cycling
          </span>
        );
    }
  };

  const totalAnomalies = brokenSuctionCount + deadheadCount + cyclingCount;

  return (
    <section
      aria-label="Forensic 15-Minute Interval Audit Ledger"
      className="bg-white border border-slate-200 p-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            02. Forensic 15-Minute Interval Audit Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Showing <span className="font-mono tabular-nums">{filteredRecords.length.toLocaleString()}</span> of{' '}
            <span className="font-mono tabular-nums">{records.length.toLocaleString()}</span> intervals
            <span aria-hidden="true"> · </span>
            Phantom Water Prevented:{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {phantomAfPrevented.toFixed(3)} AF
            </span>{' '}
            ({brokenSuctionCount} suction loss · {deadheadCount} deadhead · {cyclingCount} cycling)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
          >
            Download Ledger CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 py-3 border-b border-slate-200">
        <div
          role="group"
          aria-label="Filter intervals by forensic status"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md"
        >
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({records.length.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ANOMALIES');
              setPage(1);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === 'ANOMALIES'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flagged Anomalies ({totalAnomalies})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE);
              setPage(1);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Suction Loss ({brokenSuctionCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(IntervalStatus.OVERLOAD_OR_DEADHEAD);
              setPage(1);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === IntervalStatus.OVERLOAD_OR_DEADHEAD
                ? 'bg-white text-rose-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Deadhead ({deadheadCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(IntervalStatus.INTERMITTENT_CYCLING);
              setPage(1);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === IntervalStatus.INTERMITTENT_CYCLING
                ? 'bg-white text-purple-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cycling ({cyclingCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="month-select" className="sr-only">
            Filter by Month
          </label>
          <select
            id="month-select"
            aria-label="Filter by Month"
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 font-mono"
          >
            <option value="ALL">All Months (Apr–Oct 2026)</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>
                {ym}
              </option>
            ))}
          </select>

          <label htmlFor="interval-search" className="sr-only">
            Search timestamp or forensic note
          </label>
          <input
            id="interval-search"
            type="search"
            placeholder="Filter date or note..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
              <th className="py-2.5 px-3 whitespace-nowrap">Interval Start (Pacific)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Energy (kWh)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Demand (kW)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">DWR SWL (ft)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">TDH (ft)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Flow (GPM)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Billable Lift (AF)</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Bracket [Min – Max AF]</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Forensic Status</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Telemetry Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  No 15-minute intervals match the current filter criteria.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setMonthFilter('ALL');
                      setSearchQuery('');
                      setPage(1);
                    }}
                    className="text-sky-700 underline ml-1"
                  >
                    Reset Filters
                  </button>
                </td>
              </tr>
            ) : (
              pageSlice.map((rec, idx) => {
                const isAnomaly = rec.status !== IntervalStatus.NORMAL;
                return (
                  <tr
                    key={`${rec.interval_start}-${idx}`}
                    className={
                      isAnomaly ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {rec.interval_start}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                      {rec.kwh.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                      {rec.kw_demand.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600">
                      {rec.interpolated_swl_ft.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-700">
                      {rec.tdh_ft.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                      {rec.flow_gpm.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {rec.calculated_af.toFixed(5)}
                      {isAnomaly && rec.raw_unfiltered_af > 0 && (
                        <span
                          title="Phantom AF prevented from entering ledger"
                          className="block text-[10px] text-rose-600 line-through font-normal"
                        >
                          {rec.raw_unfiltered_af.toFixed(5)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500 whitespace-nowrap">
                      [{rec.uncertainty_bracket.af_min.toFixed(4)} –{' '}
                      {rec.uncertainty_bracket.af_max.toFixed(4)}]
                    </td>
                    <td className="py-2 px-3 text-xs">{renderStatusLabel(rec.status)}</td>
                    <td className="py-2 px-3 text-slate-600 truncate max-w-[200px]">
                      {rec.notes || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-200 text-xs text-slate-600">
        <div className="font-mono tabular-nums">
          Page {currentPage} of {totalPages} ({filteredRecords.length.toLocaleString()} intervals)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded font-medium text-slate-800 transition-colors"
          >
            Previous Page
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded font-medium text-slate-800 transition-colors"
          >
            Next Page
          </button>
        </div>
      </div>
    </section>
  );
};
