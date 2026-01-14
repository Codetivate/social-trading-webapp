import { X, SlidersHorizontal, ArrowUpDown, Filter } from "lucide-react";
// import { Slider } from "@/components/ui/slider"; // Assuming we have a slider or we use standard input for now as per plan
// If we don't have a Slider component ready in UI lib that supports range, we'll use inputs for now as per previous plan.
// The user asked for "from to max", inputs work well for this.

export interface FilterConfig {
    minProfit: number;
    maxProfit: number;
    minFee: number;
    maxFee: number;
    freeOnly: boolean;
    favoritesOnly: boolean;
    sortBy: "RECOMMENDED" | "PROFIT" | "LOW_PROFIT" | "POPULAR" | "NEW";
    // New Filters
    minDrawdown: number | "";
    maxDrawdown: number | "";
    minTimeActive: number; // Months (1, 3, 6, 12)
}

interface FilterSortModalProps {
    config: FilterConfig;
    setConfig: (c: FilterConfig) => void;
    onClose: () => void;
    resultsCount: number;
    onReset: () => void;
}

export function FilterSortModal({ config, setConfig, onClose, resultsCount, onReset }: FilterSortModalProps) {
    const handleSort = (type: FilterConfig["sortBy"]) => setConfig({ ...config, sortBy: type });
    const handleTimeActive = (months: number) => setConfig({ ...config, minTimeActive: months === config.minTimeActive ? 0 : months });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
            <div className="bg-[#050505] w-full max-w-sm rounded-[32px] border border-white/10 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">

                {/* Neon Glow Effects */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-neon-purple/50 blur-lg"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-neon-blue/10 blur-[50px] rounded-full pointing-events-none"></div>

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#050505]/90 backdrop-blur-md z-10 sticky top-0">
                    <h3 className="font-bold text-xl text-white flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                            <SlidersHorizontal size={18} className="text-neon-purple" />
                        </div>
                        Filter & Sort
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={onReset} className="text-[10px] font-bold text-gray-500 hover:text-white uppercase tracking-wider px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors">
                            Reset
                        </button>
                        <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Scrollable Body */}
                <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1 bg-[#050505]">

                    {/* 1. Sort By */}
                    <div className="space-y-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <ArrowUpDown size={12} className="text-neon-blue" /> Sort By
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {(["RECOMMENDED", "PROFIT", "LOW_PROFIT", "POPULAR", "NEW"] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => handleSort(type)}
                                    className={`h-12 px-4 rounded-2xl text-xs font-bold transition-all border flex items-center justify-center relative overflow-hidden group ${config.sortBy === type
                                        ? "bg-neon-purple/10 border-neon-purple text-neon-purple shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                                        : "bg-gray-900/40 border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                                        }`}
                                >
                                    <span className="relative z-10">
                                        {type === "RECOMMENDED" && "Recommended"}
                                        {type === "PROFIT" && "Highest Profit"}
                                        {type === "LOW_PROFIT" && "Lowest Profit"}
                                        {type === "POPULAR" && "Most Popular"}
                                        {type === "NEW" && "Newest"}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px w-full bg-linear-to-r from-transparent via-white/5 to-transparent"></div>

                    {/* 2. Profit Range (ROI) */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <label className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>Profit (ROI)</label>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 group">
                                <div className="bg-gray-900/50 rounded-xl px-4 py-3 border border-white/5 group-focus-within:border-green-500/50 group-focus-within:bg-green-500/5 transition-all flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={config.minProfit === -Infinity ? "" : config.minProfit}
                                        onChange={(e) => setConfig({ ...config, minProfit: e.target.value === "" ? -Infinity : Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="Any"
                                    />
                                    <span className="text-xs font-bold text-gray-500">%</span>
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold ml-1 uppercase mt-1 block">From</span>
                            </div>
                            <div className="w-4 h-0.5 bg-gray-800 rounded-full"></div>
                            <div className="flex-1 group">
                                <div className="bg-gray-900/50 rounded-xl px-4 py-3 border border-white/5 group-focus-within:border-green-500/50 group-focus-within:bg-green-500/5 transition-all flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={config.maxProfit === Infinity ? "" : config.maxProfit}
                                        onChange={(e) => setConfig({ ...config, maxProfit: e.target.value === "" ? Infinity : Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="Max"
                                    />
                                    <span className="text-xs font-bold text-gray-500">%</span>
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold ml-1 uppercase mt-1 block">To</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. Drawdown Range (New) */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <label className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>Max Drawdown</label>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 group">
                                <div className={`bg-gray-900/50 rounded-xl px-4 py-3 border transition-all flex items-center gap-2 ${(typeof config.minDrawdown === 'number' && (config.minDrawdown < 0 || config.minDrawdown > 100))
                                    ? "border-red-500 bg-red-500/10"
                                    : "border-white/5 group-focus-within:border-red-500/50 group-focus-within:bg-red-500/5"
                                    }`}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={config.minDrawdown}
                                        onChange={(e) => setConfig({ ...config, minDrawdown: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="0"
                                    />
                                    <span className="text-xs font-bold text-gray-500">%</span>
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold ml-1 uppercase mt-1 block">From</span>
                            </div>
                            <div className="w-4 h-0.5 bg-gray-800 rounded-full"></div>
                            <div className="flex-1 group">
                                <div className={`bg-gray-900/50 rounded-xl px-4 py-3 border transition-all flex items-center gap-2 ${(typeof config.maxDrawdown === 'number' && (config.maxDrawdown < 0 || config.maxDrawdown > 100))
                                    ? "border-red-500 bg-red-500/10"
                                    : "border-white/5 group-focus-within:border-red-500/50 group-focus-within:bg-red-500/5"
                                    }`}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={config.maxDrawdown}
                                        onChange={(e) => setConfig({ ...config, maxDrawdown: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="100"
                                    />
                                    <span className="text-xs font-bold text-gray-500">%</span>
                                </div>
                                <span className="text-[9px] text-gray-600 font-bold ml-1 uppercase mt-1 block">To</span>
                            </div>
                        </div>
                    </div>

                    {/* 4. Time Active (New) */}
                    <div className="space-y-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Time Active
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { label: "1M+", val: 1 },
                                { label: "3M+", val: 3 },
                                { label: "6M+", val: 6 },
                                { label: "1Y+", val: 12 }
                            ].map((opt) => (
                                <button
                                    key={opt.val}
                                    onClick={() => handleTimeActive(opt.val)}
                                    className={`h-10 rounded-xl text-xs font-bold transition-all border flex items-center justify-center ${config.minTimeActive === opt.val
                                        ? "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20"
                                        : "bg-gray-900/40 border-white/5 text-gray-400 hover:bg-gray-800 hover:text-white"
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 5. Fee Range */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <label className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Monthly Fee</label>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 group">
                                <div className="bg-gray-900/50 rounded-xl px-4 py-3 border border-white/5 group-focus-within:border-yellow-500/50 group-focus-within:bg-yellow-500/5 transition-all flex items-center gap-2">
                                    <span className="text-xs font-bold text-yellow-500">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.minFee}
                                        onChange={(e) => setConfig({ ...config, minFee: Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 group">
                                <div className="bg-gray-900/50 rounded-xl px-4 py-3 border border-white/5 group-focus-within:border-yellow-500/50 group-focus-within:bg-yellow-500/5 transition-all flex items-center gap-2">
                                    <span className="text-xs font-bold text-yellow-500">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.maxFee === Infinity ? "" : config.maxFee}
                                        onChange={(e) => setConfig({ ...config, maxFee: e.target.value === "" ? Infinity : Number(e.target.value) })}
                                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none placeholder-gray-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="∞"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-[#050505] sticky bottom-0 z-10">
                    <button
                        onClick={onClose}
                        className="w-full bg-white hover:bg-gray-200 text-black font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98] text-sm flex items-center justify-center gap-2"
                    >
                        Show {resultsCount} Results
                    </button>
                </div>
            </div>
        </div>
    );
}
