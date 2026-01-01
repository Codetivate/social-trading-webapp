import { ShieldCheck, X, CheckCircle2 } from "lucide-react";

interface SafetyGuardModalProps {
    risk: number | string;
    setRisk: (val: number | string) => void;
    allocation: number | string;
    setAllocation: (val: number | string) => void;
    onClose: () => void;
    onConfirm: () => void;
    maxAlloc: number;
}

export function SafetyGuardModal({ risk, setRisk, allocation, setAllocation, onClose, onConfirm, maxAlloc }: SafetyGuardModalProps) {
    const riskAmount = (Number(allocation) * Number(risk) / 100).toFixed(0);
    return (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in"><div className="bg-gray-900 w-full max-w-md rounded-3xl border border-gray-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto p-5"><div className="flex justify-between items-center"><h2 className="text-lg font-bold flex items-center gap-2 text-white"><ShieldCheck className="text-green-400" size={20} /> Safety Setup</h2><button onClick={onClose} className="bg-gray-800 p-1.5 rounded-full text-gray-400 hover:text-white"><X size={16} /></button></div><div className="space-y-2"><label className="text-xs text-gray-400 font-bold uppercase">1. Investment Amount (USD)</label><div className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex items-center gap-3"><span className="text-gray-400 font-bold">$</span><input type="number" value={allocation} onChange={(e) => setAllocation(e.target.value)} className="bg-transparent w-full font-mono text-lg font-bold text-white outline-none placeholder-gray-600" /><button onClick={() => setAllocation(maxAlloc)} className="text-[10px] bg-gray-700 px-2 py-1 rounded text-gray-300">Max</button></div></div><div className="space-y-2"><label className="text-xs text-gray-400 font-bold uppercase">2. AI Hard Cut (%)</label><div className="grid grid-cols-5 gap-2">{[10, 20, 30, 50, 95].map((val) => (<button key={val} onClick={() => setRisk(val)} className={`py-2 rounded-lg border text-xs font-bold font-mono transition-all ${Number(risk) === val ? "bg-green-600 text-white border-green-500" : "bg-gray-800 border-gray-700 text-gray-400"}`}>{val}%</button>))}</div></div><div className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex gap-3 items-start"><ShieldCheck className="text-green-500 shrink-0 mt-0.5" size={16} /><div className="space-y-1"><p className="text-xs text-gray-300">Auto-Stop if loss: <span className="text-red-400 font-bold font-mono">-${riskAmount}</span></p></div></div><button onClick={onConfirm} className="w-full bg-white active:bg-gray-200 text-black font-bold py-3.5 rounded-xl text-base shadow-xl flex items-center justify-center gap-2"><CheckCircle2 size={18} className="text-green-600" /> Confirm & Start</button></div></div>
    )
}
