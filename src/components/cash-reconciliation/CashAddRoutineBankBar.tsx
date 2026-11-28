import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { CANONICAL_BRAZILIAN_BANKS } from '../../utils/cashFileParsers.mjs';

interface CashAddRoutineBankBarProps {
  onAddRoutineBank: (bank: { bankCode: string; bankLabel: string; acctLast4?: string }) => void;
}

const BANK_OPTIONS = (CANONICAL_BRAZILIAN_BANKS as ReadonlyArray<{ code: string; label: string }>).map((b) => ({
  code: b.code,
  label: b.label
}));

/**
 * Barra compacta reutilizável para fixar manualmente um banco OFX esperado na rotina da empresa.
 */
export function CashAddRoutineBankBar({ onAddRoutineBank }: CashAddRoutineBankBarProps) {
  const [selectedCode, setSelectedCode] = useState<string>(BANK_OPTIONS[0]?.code || '336');
  const [acctLast4, setAcctLast4] = useState('');

  const handleAdd = () => {
    const picked = BANK_OPTIONS.find((b) => b.code === selectedCode) || BANK_OPTIONS[0];
    if (!picked) return;
    const cleanLast4 = acctLast4.replace(/\D/g, '').slice(-4);
    onAddRoutineBank({
      bankCode: picked.code,
      bankLabel: picked.label,
      acctLast4: cleanLast4
    });
    setAcctLast4('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <select
        value={selectedCode}
        onChange={(e) => setSelectedCode(e.target.value)}
        aria-label="Selecionar banco esperado na rotina"
        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-[11px] font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]/35"
      >
        {BANK_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label} ({opt.code})
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={acctLast4}
        onChange={(e) => setAcctLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
        placeholder="Final conta (opc.)"
        aria-label="Últimos 4 dígitos da conta (opcional)"
        className="w-28 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-[11px] text-slate-700 dark:text-[#e9edef] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]/35"
      />
      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/35 text-[11px] font-bold text-[#008f6f] dark:text-[#00a884] active:scale-95 transition-all"
      >
        <Plus size={12} />
        Salvar Banco na Rotina
      </button>
    </div>
  );
}
