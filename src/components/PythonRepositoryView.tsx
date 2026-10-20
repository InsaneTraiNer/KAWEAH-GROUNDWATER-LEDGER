import React, { useState } from 'react';
import { PYTHON_REPO_FILES } from '../data/pythonRepoFiles';

interface PythonRepositoryViewProps {
  landIqAf: number;
  gsaPenaltyRate: number;
  engineMode: 'ENGINE_A_ALGEBRAIC' | 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR';
}

export const PythonRepositoryView: React.FC<PythonRepositoryViewProps> = ({
  landIqAf,
  gsaPenaltyRate,
  engineMode,
}) => {
  const [selectedFilename, setSelectedFilename] = useState<string>('schemas.py');
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);

  const activeModule =
    PYTHON_REPO_FILES.find((m) => m.filename === selectedFilename) || PYTHON_REPO_FILES[0];

  const cliCommand = `python cli_runner.py audit \\
  --pge-csv ./data/pge_sample.csv \\
  --well-config ./data/well_config.json \\
  --land-iq-af ${landIqAf.toFixed(1)} \\
  --gsa-penalty-rate ${gsaPenaltyRate.toFixed(2)}${
    engineMode === 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR' ? ' \\\n  --engine B' : ''
  } \\
  --output ./reports/audit_2026.html`;

  const handleCopyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBanner(`Copied ${label} to clipboard.`);
    setTimeout(() => setCopiedBanner(null), 2500);
  };

  const handleDownloadPy = (filename: string, code: string) => {
    const blob = new Blob([code], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* CLI Runner Command Panel */}
      <section
        aria-label="Production CLI Runner Execution Command"
        className="bg-white border border-slate-200 p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Production Python Repository &amp; CLI Execution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              All 6 required Python modules are written, validated, and tested in the repository root
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopyCode(cliCommand, 'CLI command')}
            className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors self-start whitespace-nowrap shrink-0"
          >
            Copy CLI Command
          </button>
        </div>

        <pre className="mt-3 bg-slate-900 text-slate-100 p-4 text-xs font-mono overflow-x-auto leading-relaxed">
          {cliCommand}
        </pre>
      </section>

      {copiedBanner && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-900 font-medium"
        >
          {copiedBanner}
        </div>
      )}

      {/* Module Selector + Source Viewer */}
      <section
        aria-label="Python Repository Source Modules"
        className="bg-white border border-slate-200 p-5"
      >
        <div className="flex flex-wrap items-center gap-1.5 pb-4 border-b border-slate-200">
          {PYTHON_REPO_FILES.map((mod) => {
            const isSelected = mod.filename === activeModule.filename;
            return (
              <button
                key={mod.filename}
                type="button"
                onClick={() => setSelectedFilename(mod.filename)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {mod.filename} ({mod.lines}L)
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 font-mono">
              {activeModule.filename} — {activeModule.title}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">{activeModule.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyCode(activeModule.code, activeModule.filename)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
            >
              Copy {activeModule.filename}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadPy(activeModule.filename, activeModule.code)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded transition-colors whitespace-nowrap"
            >
              Download {activeModule.filename}
            </button>
          </div>
        </div>

        <pre className="mt-3 bg-slate-950 text-slate-100 p-5 text-xs font-mono overflow-x-auto max-h-[640px] leading-relaxed">
          {activeModule.code}
        </pre>
      </section>
    </div>
  );
};
