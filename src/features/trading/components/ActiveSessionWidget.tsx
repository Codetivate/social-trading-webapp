import { useState, useEffect } from "react";
import { Ticket, Sparkles, StopCircle, Crown, Clock, ArrowRight, ShieldCheck, Repeat, ArrowLeftRight, Zap, Target } from "lucide-react";
import { Master, Session as CopySession } from "@/types";

interface ActiveSessionWidgetProps {
    master: Master;
    time: number;
    risk: number | string;
    allocation: number;
    onStop: () => void;
    session: CopySession;
    onClick?: () => void;
    currencySymbol?: string;
}

export function ActiveSessionWidget({ master, time, risk, allocation, onStop, session, onClick, currencySymbol = "$" }: ActiveSessionWidgetProps) {
    const [timeDisplay, setTimeDisplay] = useState("Loading...");

    // Time countdown logic
    useEffect(() => {
        const formatTime = (s: number) => {
            if (s <= 0) return "00:00:00";
            const days = Math.floor(s / 86400);
            const hours = Math.floor((s % 86400) / 3600);
            const minutes = Math.floor((s % 3600) / 60);
            const seconds = s % 60;

            if (days > 0) return `${days}d ${hours}h ${minutes}m`;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        if (session.type === "TRIAL_7DAY" || session.type === "DAILY") {
            const label = session.type === "TRIAL_7DAY" ? "Trial" : "Daily";
            setTimeDisplay(`${formatTime(time)} (${label})`);
        } else {
            setTimeDisplay("Unlimited");
        }
    }, [time, session]);

    // SafetyGuard Settings Extraction
    const isAutoRenew = (session as any).autoRenew;
    const isInvert = (session as any).invertCopy;
    const timeConfig = (session as any).timeConfig as any;
    const is247 = !timeConfig || timeConfig?.mode === "24/7";

    // Parse Risk - Prop passed is usually the risk factor/level
    const riskValue = typeof risk === 'number' ? `${risk}%` : risk;

    const pnl = session.unrealizedPnL || session.pnl || 0;
    const isProfit = pnl >= 0;

    return (
        <div className="bg-[#0F1115] rounded-3xl border border-white/5 overflow-hidden shadow-xl hover:shadow-neon-purple/10 transition-all duration-300 group relative">

            {/* 🟢 Status Indicator Line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-neon-purple to-neon-cyan"></div>

            {/* HEADER: Master Profile & Navigation */}
            <div className="p-5 flex justify-between items-center bg-white/2">
                <div
                    className="flex items-center gap-4 cursor-pointer group/profile"
                    onClick={onClick} /* Navigate to Profile */
                >
                    <div className="relative">
                        <img src={master?.avatar} alt={master?.name} className="w-12 h-12 rounded-xl border-2 border-white/10 group-hover/profile:border-neon-purple transition-colors" />
                        <div className="absolute -bottom-1 -right-1 bg-green-500 w-3 h-3 rounded-full border-2 border-[#0F1115] animate-pulse"></div>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base group-hover/profile:text-neon-purple transition-colors flex items-center gap-2">
                            {master?.name}
                            <ArrowRight size={14} className="opacity-0 group-hover/profile:opacity-100 -translate-x-2 group-hover/profile:translate-x-0 transition-all text-neon-purple" />
                        </h3>
                        {/* Explicit Button within the clickable area context or alongside */}
                        <button className="text-[10px] bg-white/5 hover:bg-neon-purple/20 hover:text-neon-purple text-gray-400 px-2 py-0.5 rounded-full mt-1 flex items-center gap-1 transition-all border border-white/5">
                            View Profile
                        </button>
                    </div>
                </div>

                {/* PnL Display (Big & Bold) */}
                <div className="text-right">
                    <div className={`text-xl font-black tracking-tight ${isProfit ? "text-green-400" : "text-red-400"}`}>
                        {isProfit ? "+" : ""}{currencySymbol}{pnl.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Unrealized PnL</div>
                </div>
            </div>

            {/* BODY: Stats & SafetyGuard Grid */}
            <div className="p-5 pt-2 space-y-5">

                {/* Primary Stats */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Total Allocation</p>
                        <p className="text-white font-mono font-bold text-sm tracking-wide">{currencySymbol}{allocation.toLocaleString()}</p>
                    </div>
                    <div className="h-8 w-px bg-white/10"></div>
                    <div className="text-right">
                        <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Time Remaining</p>
                        <p className="text-neon-cyan font-mono font-bold text-xs flex items-center justify-end gap-1">
                            <Clock size={12} /> {timeDisplay}
                        </p>
                    </div>
                </div>

                {/* 🛡️ SafetyGuard Settings (Reminder) */}
                <div>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                        <ShieldCheck size={12} className="text-neon-purple" /> Safety Guard Settings
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Risk (Renamed to Lot Sizing) */}
                        <div className="bg-gray-900/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3">
                            <div className="bg-blue-500/10 p-1.5 rounded-lg"><Target size={14} className="text-blue-400" /></div>
                            <div>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Lot Sizing</p>
                                <p className="text-blue-400 text-[10px] font-bold">Equity Ratio ({riskValue})</p>
                            </div>
                        </div>
                        {/* Trading Mode */}
                        <div className="bg-gray-900/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3">
                            <div className="bg-purple-500/10 p-1.5 rounded-lg"><Zap size={14} className="text-purple-400" /></div>
                            <div>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Timing</p>
                                <p className="text-gray-200 text-xs font-bold">{is247 ? "24/7 Active" : "Scheduled"}</p>
                            </div>
                        </div>
                        {/* Invert */}
                        <div className="bg-gray-900/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg ${isInvert ? "bg-orange-500/10" : "bg-gray-800"}`}>
                                <ArrowLeftRight size={14} className={isInvert ? "text-orange-400" : "text-gray-500"} />
                            </div>
                            <div>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Invert Copy</p>
                                <p className={`text-xs font-bold ${isInvert ? "text-orange-400" : "text-gray-500"}`}>{isInvert ? "Enabled" : "Disabled"}</p>
                            </div>
                        </div>
                        {/* Auto Renew */}
                        <div className="bg-gray-900/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg ${isAutoRenew ? "bg-green-500/10" : "bg-gray-800"}`}>
                                <Repeat size={14} className={isAutoRenew ? "text-green-400" : "text-gray-500"} />
                            </div>
                            <div>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Auto Renew</p>
                                <p className={`text-xs font-bold ${isAutoRenew ? "text-green-400" : "text-gray-500"}`}>{isAutoRenew ? "On" : "Off"}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="p-4 bg-red-500/5 border-t border-red-500/10 flex justify-between items-center gap-3">
                <button
                    onClick={(e) => { e.stopPropagation(); onStop(); }}
                    className="w-full bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 hover:border-red-500 text-xs font-bold py-3 rounded-xl flex justify-center items-center gap-2 transition-all shadow-lg shadow-transparent hover:shadow-red-500/20"
                >
                    <StopCircle size={16} /> Stop Copying
                </button>
            </div>
        </div>
    )
}
