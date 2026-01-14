import { ShieldCheck, X, CheckCircle2, Info, Clock, Globe, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface SafetyGuardModalProps {
    // Initial Values (Controlled -> Uncontrolled Transition)
    initialRisk?: number | string;
    initialAllocation?: number | string;
    initialProRata?: number; // 🆕 Pro-Rata Support
    initialAutoRenew?: boolean;
    initialTimeConfig?: any;
    initialUseWelcome?: boolean;
    initialInvert?: boolean; // 🆕
    initialCopyMode?: "FIXED" | "EQUITY"; // 🆕 Equity Ratio Support


    // Callbacks
    onClose: () => void;
    onConfirm: (data: {
        allocation: number;
        risk: number | string;
        proRataPercent: number; // 🆕
        autoRenew: boolean;
        timeConfig: any;
        useWelcome: boolean;
        invertCopy: boolean; // 🆕 Invert Mode
        copyMode: "FIXED" | "EQUITY"; // 🆕
    }) => void; // Returns final data

    maxAlloc: number;
    showWelcomeOption?: boolean;
}

// 🛡️ REFACTORED: Internal State Management for Stability
export function SafetyGuardModal({
    initialRisk = 20,
    initialAllocation = 1000,
    initialProRata = 100, // Default 100% (1:1 scaling)
    initialAutoRenew = true,
    initialTimeConfig = { mode: "24/7", start: "00:00", end: "00:00" },
    initialUseWelcome = false,
    initialInvert = false,
    initialCopyMode = "EQUITY", // 🛠️ DEBUG/FIX: Default to Equity Ratio
    onClose,
    onConfirm,
    maxAlloc,
    showWelcomeOption
}: SafetyGuardModalProps) {
    const [activeInfo, setActiveInfo] = useState<"NONE" | "GENERAL" | "LOT_MODES">("NONE");

    // 🔒 Internal State (Buffers touches from parent re-renders)
    const [risk, setRisk] = useState(initialRisk);
    const [allocation, setAllocation] = useState(initialAllocation);
    const [proRataPercent, setProRataPercent] = useState<number | string>(initialProRata); // 🆕
    const [autoRenew, setAutoRenew] = useState(false);
    const [timeConfig, setTimeConfig] = useState(initialTimeConfig);
    const [useWelcome, setUseWelcome] = useState(initialUseWelcome);
    const [invertCopy, setInvertCopy] = useState(initialInvert);
    const [copyMode, setCopyMode] = useState<"FIXED" | "EQUITY">(initialCopyMode); // 🆕


    const riskAmount = (Number(allocation) * Number(risk) / 100).toFixed(0);

    // 🌍 TIMEZONE & LIVE CLOCK STATE
    // Removed currentTime state to prevent re-renders. Moved to LiveClockDisplay.
    const [userTimezoneOffset, setUserTimezoneOffset] = useState(-new Date().getTimezoneOffset()); // Browser default (minutes)
    const [selectedGmtOffset, setSelectedGmtOffset] = useState(0); // For Selector (Hours)

    // Sync Initial GMT
    useEffect(() => {
        // Round to nearest hour for initial selection
        const hours = -new Date().getTimezoneOffset() / 60;
        setSelectedGmtOffset(Math.round(hours));

        // 🛠️ FORCE EQUITY MODE (Debug Fix)
        // If it initialized to FIXED for some reason, switch it to EQUITY immediately.
        if (copyMode === "FIXED") {
            console.log("🛠️ Force-switching to EQUITY mode on mount");
            setCopyMode("EQUITY");
        }
    }, []);

    // ⏱️ LIVE CLOCK TIMER - Removed, now handled by LiveClockDisplay component.

    // 🛠️ HELPER: Format UTC Hour to "User Local Time"
    const formatLocalTime = (utcHour: number) => {
        let localHour = utcHour + selectedGmtOffset;
        if (localHour >= 24) localHour -= 24;
        if (localHour < 0) localHour += 24;
        return `${String(Math.floor(localHour)).padStart(2, '0')}:00`;
    };

    // 🛠️ HELPER: Get Dynamic Label
    const getSessionLabel = (name: string, startUtc: number, endUtc: number) => {
        if (selectedGmtOffset === 0) return `${name} (${String(startUtc).padStart(2, '0')}-${String(endUtc).padStart(2, '0')} UTC)`;
        return `${name} (${formatLocalTime(startUtc)}-${formatLocalTime(endUtc)})`;
    };

    return (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-gray-950 w-full sm:max-w-md sm:rounded-3xl border-t sm:border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] h-full sm:h-auto relative overflow-hidden" onClick={(e) => e.stopPropagation()}>

                {/* ℹ️ INFO OVERLAY SYSTEM */}
                {activeInfo !== "NONE" && (
                    <div className="absolute inset-0 bg-gray-950/98 z-50 p-6 flex flex-col rounded-3xl animate-in fade-in zoom-in-95 backdrop-blur-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                                <Info size={20} className="text-neon-cyan" />
                                {activeInfo === "GENERAL" ? "Allocation Policy" : "Lot Sizing Modes"}
                            </h3>
                            <button onClick={() => setActiveInfo("NONE")} className="bg-gray-800 p-2 rounded-full hover:bg-gray-700 transition-colors">
                                <X size={18} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-5 text-sm leading-relaxed pr-2 custom-scrollbar">
                            {activeInfo === "GENERAL" ? (
                                <>
                                    <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                        <strong className="text-white block mb-1 text-xs uppercase tracking-wider">Allocation Base</strong>
                                        <p className="text-gray-400">Your copy trades are sized based on your *Investment Amount*, not your entire wallet balance. This isolates risk.</p>
                                    </div>
                                    <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                        <strong className="text-white block mb-1 text-xs uppercase tracking-wider">Proportional Sizing</strong>
                                        <p className="text-gray-400">If Master risks 1% of their account, you risk 1% of your Allocation Amount.</p>
                                    </div>
                                    <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                        <strong className="text-white block mb-1 text-xs uppercase tracking-wider">Hard Cap</strong>
                                        <p className="text-gray-400">Losses are logically capped at your Allocation amount. The engine will not execute trades if margin is insufficient.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/30">
                                        <strong className="text-blue-300 mb-1 text-xs uppercase tracking-wider flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Fixed Ratio (Lot-for-Lot)
                                        </strong>
                                        <p className="text-gray-400 mb-2">Copies based on exact lot size multipliers.</p>
                                        <code className="block bg-black/30 p-2 rounded text-xs text-blue-200 font-mono">
                                            MyLots = MasterLots × Ratio %
                                        </code>
                                        <p className="text-xs text-gray-500 mt-2 italic">Best for: Exact mirroring when you want total control over size.</p>
                                    </div>

                                    <div className="bg-orange-900/20 p-3 rounded-lg border border-orange-500/30">
                                        <strong className="text-orange-300 mb-1 text-xs uppercase tracking-wider flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-orange-500"></span> Equity Ratio (Dynamic)
                                        </strong>
                                        <p className="text-gray-400 mb-2">Scales trade size based on the ratio of Your Equity vs Master Equity.</p>
                                        <code className="block bg-black/30 p-2 rounded text-xs text-orange-200 font-mono">
                                            Multiplier = MyEquity / MasterEquity
                                        </code>
                                        <p className="text-xs text-gray-500 mt-2 italic">Best for: "Set and forget" growth that compounds automatically.</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* HEADER */}
                <div className="flex-none flex justify-between items-center p-4 sm:p-6 pb-2 sm:pb-4 border-b border-gray-900/50 bg-gray-950 z-10">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <ShieldCheck className="text-green-400" size={20} /> Safety Setup
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveInfo(activeInfo === "GENERAL" ? "NONE" : "GENERAL")}
                            className="bg-gray-800 p-1.5 rounded-full text-neon-cyan hover:text-white hover:bg-gray-700 transition-colors"
                            title="Allocation Policy"
                        >
                            <Info size={16} />
                        </button>
                        <button onClick={onClose} className="bg-gray-800 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">

                    {/* 🎫 TICKET TYPE INDICATOR */}
                    <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 flex justify-between items-center">
                        <span className="text-gray-400 text-xs font-bold uppercase">Active Ticket</span>
                        <div className="flex gap-2 items-center">
                            {useWelcome ? (
                                <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-1 rounded border border-green-500/30 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> Welcome Promo
                                </span>
                            ) : (
                                <span className="bg-gray-700 text-gray-300 text-[10px] font-bold px-2 py-1 rounded border border-gray-600 flex items-center gap-1">
                                    <Clock size={10} /> Standard (24/7)
                                </span>
                            )}
                            {showWelcomeOption && (
                                <button onClick={() => setUseWelcome(!useWelcome)} className="text-[10px] text-gray-500 underline hover:text-white transition-colors">
                                    Change
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] sm:text-xs text-gray-400 font-bold uppercase tracking-wider">Investment Amount (USD)</label>
                        <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 flex items-center gap-3 focus-within:border-neon-purple transition-colors h-11">
                            <span className="text-gray-400 font-bold text-sm">$</span>
                            <input
                                type="number"
                                value={allocation}
                                onChange={(e) => setAllocation(e.target.value)}
                                className="bg-transparent w-full font-mono text-base sm:text-lg font-bold text-white outline-none placeholder-gray-700 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => setAllocation(maxAlloc)} className="text-[10px] bg-gray-800 px-2 py-1 rounded text-neon-cyan hover:bg-gray-700 transition-colors uppercase font-bold tracking-wide">Max</button>
                        </div>
                    </div>

                    {/* 🔄 COPY DIRECTION */}
                    <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 space-y-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Copy Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setInvertCopy(false)}
                                className={`p-2 rounded-lg text-center border transition-all ${!invertCopy ? "bg-blue-600/20 text-blue-300 border-blue-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}
                            >
                                <span className="text-xs font-bold block">Follow Master</span>
                                <span className="text-[9px] opacity-70">Same Direction</span>
                            </button>
                            <button
                                onClick={() => setInvertCopy(true)}
                                className={`p-2 rounded-lg text-center border transition-all ${invertCopy ? "bg-purple-600/20 text-purple-300 border-purple-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}
                            >
                                <span className="text-xs font-bold block">Invert Master</span>
                                <span className="text-[9px] opacity-70">Reverse Direction</span>
                            </button>
                        </div>
                        <p className="text-[9px] text-gray-500 pl-1">
                            {invertCopy ? "Master Buy → You Sell. TP/SL Swapped." : "Master Buy → You Buy. TP/SL Matched."}
                        </p>
                    </div>

                    {/* ⚖️ LOT SIZING MODE & PRO-RATA */}
                    <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                                Lot Sizing Mode
                                <button onClick={() => setActiveInfo("LOT_MODES")} className="text-gray-500 hover:text-white transition-colors">
                                    <Info size={10} />
                                </button>
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setCopyMode("FIXED")}
                                className={`p-2 rounded-lg text-center border transition-all ${copyMode === "FIXED" ? "bg-cyan-600/20 text-cyan-300 border-cyan-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}
                            >
                                <span className="text-xs font-bold block">Fixed Ratio</span>
                                <span className="text-[9px] opacity-70">Based on Lots</span>
                            </button>
                            <button
                                onClick={() => {
                                    setCopyMode("EQUITY");
                                    setProRataPercent(100); // 🔒 Force 100% Default
                                }}
                                className={`p-2 rounded-lg text-center border transition-all ${copyMode === "EQUITY" ? "bg-orange-600/20 text-orange-300 border-orange-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}
                            >
                                <span className="text-xs font-bold block">Equity Ratio</span>
                                <span className="text-[9px] opacity-70">Based on Balance</span>
                            </button>
                        </div>

                        {/* PRO RATA INPUT */}
                        <div className="space-y-2 pt-2 border-t border-gray-800/50">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] sm:text-xs text-gray-400 font-bold uppercase flex items-center gap-1">
                                    {copyMode === "EQUITY" ? "Equity Multiplier" : "Pro-Rata Scaling"}
                                </label>
                            </div>

                            <div className="flex items-center h-10">
                                <input
                                    type="number"
                                    value={proRataPercent}
                                    disabled={copyMode === "EQUITY"} // 🔒 Lock Input in Equity Mode
                                    onChange={(e) => setProRataPercent(e.target.value === '' ? '' : Number(e.target.value))}
                                    className={`flex-1 bg-gray-900 hover:bg-gray-800 text-white font-mono text-lg font-bold px-3 h-full rounded-l-lg outline-none border border-r-0 border-gray-800 focus:border-neon-purple focus:ring-0 focus:outline-none transition-all placeholder-gray-700 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${proRataPercent === '' ? 'ring-2 ring-red-500 inset' : ''} ${copyMode === 'EQUITY' ? 'opacity-50 cursor-not-allowed text-gray-500 bg-gray-900/50' : ''}`}
                                    placeholder="100"
                                />
                                <div className="bg-gray-800 border border-gray-800 border-l-0 text-gray-400 font-bold text-sm px-4 h-full rounded-r-lg flex items-center justify-center">
                                    %
                                </div>
                            </div>

                            {/* Validation Message */}
                            {proRataPercent === '' && (
                                <p className="text-red-400 text-[10px] font-bold mt-1 pl-1">⚠️ This field cannot be empty</p>
                            )}

                            <div className="text-[10px] text-gray-500 font-medium pl-1 gap-1">
                                {copyMode === "FIXED" ? (
                                    <>
                                        <span className="text-gray-400">Example:</span> Master 1.00 Lot × <span className="text-white font-bold">{proRataPercent || 100}%</span> = You <span className="text-neon-cyan font-bold">{(1 * (Number(proRataPercent) || 0) / 100).toFixed(2)} Lots</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-gray-400">Example:</span> (Your Eq / Master Eq) × <span className="text-white font-bold">{proRataPercent || 100}%</span>
                                        <div className="text-orange-400/80 mt-0.5 font-bold">Adjusts dynamically as equity changes.</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 4. ADVANCED SETTINGS */}
                    <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 space-y-3">
                        {/* TIME CONFIG */}
                        <div className="space-y-3">
                            {/* HEADER: Timezone Selector & Live Clock */}
                            <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2 relative z-50">
                                <div className="flex items-center gap-1.5">
                                    <Globe size={14} className="text-neon-purple mt-0.5" />
                                    {/* SHADCN SELECT */}
                                    <Select
                                        value={selectedGmtOffset.toString()}
                                        onValueChange={(val) => setSelectedGmtOffset(Number(val))}
                                    >
                                        <SelectTrigger className="w-auto h-6 p-0 border-none bg-transparent text-[10px] font-bold text-gray-300 uppercase tracking-wider focus:ring-0 gap-1 hover:text-white data-placeholder:text-gray-300">
                                            <SelectValue placeholder="GMT" />
                                        </SelectTrigger>
                                        <SelectContent position="popper" side="bottom" className="bg-gray-900 border-gray-700 max-h-[30vh] overflow-y-auto z-100 min-w-(--radix-select-trigger-width)">
                                            {Array.from({ length: 25 }, (_, i) => i - 12).map(offset => (
                                                <SelectItem
                                                    key={offset}
                                                    value={offset.toString()}
                                                    className="text-[10px] font-bold text-gray-400 focus:bg-gray-800 focus:text-neon-cyan data-[state=checked]:text-neon-cyan data-[state=checked]:bg-gray-800"
                                                >
                                                    GMT {offset >= 0 ? "+" : ""}{offset}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                                    <Clock size={12} />
                                    <LiveClockDisplay selectedGmtOffset={selectedGmtOffset} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: "24/7", label: "24/7 Always On", desc: "No restrictions", s: 0, e: 0 },
                                    { id: "LONDON", label: "London", desc: getSessionLabel("LDN", 8, 16), s: 8, e: 16 },
                                    { id: "NY", label: "New York", desc: getSessionLabel("NYC", 13, 21), s: 13, e: 21 },
                                    { id: "ASIA", label: "Tokyo", desc: getSessionLabel("TKY", 0, 8), s: 0, e: 8 },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setTimeConfig({
                                            mode: opt.id,
                                            start: `${String(opt.s).padStart(2, '0')}:00`,
                                            end: `${String(opt.e).padStart(2, '0')}:00`
                                        })}
                                        className={`p-1.5 rounded-lg text-left border transition-all ${timeConfig?.mode === opt.id
                                            ? "bg-blue-600/20 border-blue-500/50"
                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"}`}
                                    >
                                        <div className={`text-[10px] font-bold ${timeConfig?.mode === opt.id ? "text-blue-300" : "text-gray-300"}`}>{opt.label}</div>
                                        <div className="text-[9px] text-gray-500 font-mono mt-0.5">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>

                            {/* Custom Option & Input */}
                            <div className={`transition-all duration-300 ${timeConfig?.mode === "CUSTOM" ? "opacity-100 max-h-20" : "opacity-50 max-h-8 overflow-hidden"}`}>
                                <button
                                    onClick={() => setTimeConfig({ ...timeConfig, mode: "CUSTOM" })}
                                    className={`w-full text-left text-[10px] font-bold uppercase tracking-wider mb-2 ${timeConfig?.mode === "CUSTOM" ? "text-neon-cyan" : "text-gray-500 hover:text-gray-300"}`}
                                >
                                    Custom Hours (UTC)
                                </button>

                                {timeConfig?.mode === "CUSTOM" && (
                                    <div className="flex gap-2 items-center bg-gray-900/50 p-2 rounded-lg border border-gray-700/50">
                                        {/* START TIME */}
                                        <div className="flex-1">
                                            <span className="text-[9px] text-gray-500 block mb-1">Start (UTC)</span>
                                            <div className="flex gap-1">
                                                <Select
                                                    value={timeConfig.start ? timeConfig.start.split(':')[0] : "09"}
                                                    onValueChange={(h) => setTimeConfig({ ...timeConfig, start: `${h}:${timeConfig.start ? timeConfig.start.split(':')[1] : "00"}` })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent position="popper" side="bottom" className="z-100 max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-(--radix-select-trigger-width)">
                                                        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                                                            <SelectItem key={h} value={h} className="text-sm py-2">{h}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-gray-500 self-center">:</span>
                                                <Select
                                                    value={timeConfig.start ? timeConfig.start.split(':')[1] : "00"}
                                                    onValueChange={(m) => setTimeConfig({ ...timeConfig, start: `${timeConfig.start ? timeConfig.start.split(':')[0] : "09"}:${m}` })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent position="popper" side="bottom" className="z-100 max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-(--radix-select-trigger-width)">
                                                        {["00", "15", "30", "45"].map(m => (
                                                            <SelectItem key={m} value={m} className="text-sm py-2">{m}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* END TIME */}
                                        <div className="flex-1 text-right">
                                            <span className="text-[9px] text-gray-500 block mb-1">End (UTC)</span>
                                            <div className="flex gap-1 justify-end">
                                                <Select
                                                    value={timeConfig.end ? timeConfig.end.split(':')[0] : "17"}
                                                    onValueChange={(h) => setTimeConfig({ ...timeConfig, end: `${h}:${timeConfig.end ? timeConfig.end.split(':')[1] : "00"}` })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent position="popper" side="bottom" className="z-100 max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-(--radix-select-trigger-width)">
                                                        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                                                            <SelectItem key={h} value={h} className="text-sm py-2">{h}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-gray-500 self-center">:</span>
                                                <Select
                                                    value={timeConfig.end ? timeConfig.end.split(':')[1] : "00"}
                                                    onValueChange={(m) => setTimeConfig({ ...timeConfig, end: `${timeConfig.end ? timeConfig.end.split(':')[0] : "17"}:${m}` })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent position="popper" side="bottom" className="z-100 max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-(--radix-select-trigger-width)">
                                                        {["00", "15", "30", "45"].map(m => (
                                                            <SelectItem key={m} value={m} className="text-sm py-2">{m}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* STICKY FOOTER */}
                <div className="flex-none p-4 bg-gray-950 border-t border-gray-900 z-20">
                    <button
                        onClick={() => {
                            // VALIDATION
                            if (!timeConfig) {
                                toast.error("Please select a trading session.");
                                return;
                            }
                            if (timeConfig?.mode === "CUSTOM" && (!timeConfig.start || !timeConfig.end || timeConfig.start === timeConfig.end)) {
                                toast.error("Please specify a valid time range for Custom Copy.");
                                return;
                            }

                            // VALIDATION: Pro Rata
                            if (proRataPercent === "") {
                                toast.error("Pro-Rata Scaling cannot be empty.");
                                return;
                            }

                            console.log("🛡️ SafetyGuardModal confirming with CopyMode:", copyMode);

                            // Confirmation - Pass Data Up
                            onConfirm({
                                allocation: Number(allocation),
                                risk,
                                proRataPercent: Number(proRataPercent),
                                autoRenew,
                                timeConfig,
                                useWelcome,
                                invertCopy,
                                copyMode // 🆕
                            });
                        }}
                        className="w-full bg-white active:bg-gray-200 text-black font-bold py-3 rounded-xl text-sm uppercase tracking-wide shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                    >
                        <CheckCircle2 size={16} className="text-green-600" /> Confirm & Start
                    </button>
                </div>
            </div>
        </div>
    )
}


const LiveClockDisplay = ({ selectedGmtOffset }: { selectedGmtOffset: number }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const displayTime = new Date(currentTime.getTime() + (selectedGmtOffset * 60 * 60 * 1000) + (currentTime.getTimezoneOffset() * 60 * 1000));
    return <span>{displayTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>;
};
