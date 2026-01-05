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
    initialAutoRenew?: boolean;
    initialTimeConfig?: any;
    initialUseWelcome?: boolean;

    // Callbacks
    onClose: () => void;
    onConfirm: (data: {
        allocation: number;
        risk: number | string;
        autoRenew: boolean;
        timeConfig: any;
        useWelcome: boolean;
    }) => void; // Returns final data

    maxAlloc: number;
    showWelcomeOption?: boolean;
}

// 🛡️ REFACTORED: Internal State Management for Stability
export function SafetyGuardModal({
    initialRisk = 20,
    initialAllocation = 1000,
    initialAutoRenew = true,
    initialTimeConfig = { mode: "24/7", start: "00:00", end: "00:00" },
    initialUseWelcome = false,
    onClose,
    onConfirm,
    maxAlloc,
    showWelcomeOption
}: SafetyGuardModalProps) {
    const [showInfo, setShowInfo] = useState(false);

    // 🔒 Internal State (Buffers touches from parent re-renders)
    const [risk, setRisk] = useState(initialRisk);
    const [allocation, setAllocation] = useState(initialAllocation);
    const [autoRenew, setAutoRenew] = useState(false);
    const [timeConfig, setTimeConfig] = useState(initialTimeConfig);
    const [useWelcome, setUseWelcome] = useState(initialUseWelcome);

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
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-gray-900 w-full max-w-md rounded-3xl border border-gray-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto p-5 relative" onClick={(e) => e.stopPropagation()}>

                {/* INFO OVERLAY */}
                {showInfo && (
                    <div className="absolute inset-0 bg-gray-900/98 z-50 p-6 flex flex-col justify-center rounded-3xl animate-in fade-in zoom-in-95 border border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                                <Info size={20} className="text-neon-cyan" /> Allocation Policy
                            </h3>
                            <button onClick={() => setShowInfo(false)} className="bg-gray-800 p-2 rounded-full hover:bg-gray-700 transition-colors">
                                <X size={18} className="text-gray-400" />
                            </button>
                        </div>
                        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                            <p>
                                <strong className="text-white block mb-1">Allocation Base</strong>
                                Sizing is based on *Allocation*, not Wallet Balance.
                            </p>
                            <p>
                                <strong className="text-white block mb-1">Proportional Sizing</strong>
                                1% Master Risk = 1% Allocation Risk.
                            </p>
                            <p>
                                <strong className="text-white block mb-1">Isolation</strong>
                                Losses cannot exceed allocation.
                            </p>
                            <p>
                                <strong className="text-white block mb-1">Min Lot</strong>
                                &lt;0.01 lots rounds up to 0.01.
                            </p>
                        </div>
                    </div>
                )}

                {/* MAIN HEADER */}
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <ShieldCheck className="text-green-400" size={20} /> Safety Setup
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowInfo(!showInfo)}
                            className="bg-gray-800 p-1.5 rounded-full text-neon-cyan hover:text-white hover:bg-gray-700 transition-colors"
                            title="How it works"
                        >
                            <Info size={16} />
                        </button>
                        <button onClick={onClose} className="bg-gray-800 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* INPUTS */}
                {/* 🎫 TICKET TYPE INDICATOR */}
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 flex justify-between items-center">
                    <span className="text-gray-400 text-xs font-bold uppercase">Active Ticket</span>
                    <div className="flex gap-2 items-center">
                        {useWelcome ? (
                            <span className="flex items-center gap-1 text-neon-pink text-xs font-bold bg-neon-pink/10 px-2 py-1 rounded border border-neon-pink/20"><Globe size={12} /> Welcome (7 Days)</span>
                        ) : (
                            <span className="flex items-center gap-1 text-neon-cyan text-xs font-bold bg-neon-cyan/10 px-2 py-1 rounded border border-neon-cyan/20"><Clock size={12} /> Standard (4h)</span>
                        )}
                        {/* Interactive Toggle */}
                        {showWelcomeOption && (
                            <button onClick={() => setUseWelcome(!useWelcome)} className="text-[10px] text-gray-500 hover:text-white ml-2 underline">Change</button>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold uppercase">1. Investment Amount (USD)</label>
                    <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex items-center gap-3 focus-within:border-neon-purple transition-colors">
                        <span className="text-gray-400 font-bold">$</span>
                        <input
                            type="number"
                            value={allocation}
                            onChange={(e) => setAllocation(e.target.value)}
                            className="bg-transparent w-full font-mono text-lg font-bold text-white outline-none placeholder-gray-600"
                        />
                        <button onClick={() => setAllocation(maxAlloc)} className="text-[10px] bg-gray-700 px-2 py-1 rounded text-gray-300 hover:bg-gray-600 transition-colors">Max</button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold uppercase">3. AI Hard Cut (%)</label>
                    <div className="grid grid-cols-5 gap-2">
                        {[10, 20, 30, 50, 95].map((val) => (
                            <button
                                key={val}
                                onClick={() => setRisk(val)}
                                className={`py-2 rounded-lg border text-xs font-bold font-mono transition-all ${Number(risk) === val ? "bg-green-600 text-white border-green-500 shadow-lg shadow-green-900/20" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"}`}
                            >
                                {val}%
                            </button>
                        ))}
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
                                    <SelectTrigger className="w-auto h-6 p-0 border-none bg-transparent text-[10px] font-bold text-gray-300 uppercase tracking-wider focus:ring-0 gap-1 hover:text-white data-[placeholder]:text-gray-300">
                                        <SelectValue placeholder="GMT" />
                                    </SelectTrigger>
                                    <SelectContent position="popper" side="bottom" className="bg-gray-900 border-gray-700 max-h-[30vh] overflow-y-auto z-[100] min-w-[var(--radix-select-trigger-width)]">
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
                                    className={`p-2 rounded-lg text-left border transition-all ${timeConfig?.mode === opt.id
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
                                                <SelectContent position="popper" side="bottom" className="z-[100] max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-[var(--radix-select-trigger-width)]">
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
                                                <SelectContent position="popper" side="bottom" className="z-[100] max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-[var(--radix-select-trigger-width)]">
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
                                                <SelectContent position="popper" side="bottom" className="z-[100] max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-[var(--radix-select-trigger-width)]">
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
                                                <SelectContent position="popper" side="bottom" className="z-[100] max-h-[30vh] overflow-y-auto bg-gray-900 border-gray-700 min-w-[var(--radix-select-trigger-width)]">
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

                {/* SUMMARY */}
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex gap-3 items-start">
                    <ShieldCheck className="text-green-500 shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                        <p className="text-xs text-gray-300">
                            Auto-Stop if loss: <span className="text-red-400 font-bold font-mono">-${riskAmount}</span>
                        </p>
                    </div>
                </div>

                {/* ACTION BUTTON */}
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

                        // Confirmation - Pass Data Up
                        onConfirm({
                            allocation: Number(allocation),
                            risk,
                            autoRenew,
                            timeConfig,
                            useWelcome
                        });
                    }}
                    className="w-full bg-white active:bg-gray-200 text-black font-bold py-3.5 rounded-xl text-base shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                >
                    <CheckCircle2 size={18} className="text-green-600" /> Confirm & Start
                </button>
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
