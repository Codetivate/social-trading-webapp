import { useState, useEffect } from "react";
import { Ticket, Sparkles, StopCircle, Crown, Clock } from "lucide-react";
import { Master, Session as CopySession } from "@/types";

interface ActiveSessionWidgetProps {
    master: Master;
    time: number;
    risk: number | string;
    allocation: number;
    onStop: () => void;
    session: CopySession;
    onClick?: () => void;
    currencySymbol?: string; // ✅ New Prop
}

export function ActiveSessionWidget({ master, time, risk, allocation, onStop, session, onClick, currencySymbol = "$" }: ActiveSessionWidgetProps) {
    const [timeDisplay, setTimeDisplay] = useState("Loading...");

    // ... (keep useEffect) ...

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

    let badge = null;
    let borderColor = "border-gray-700";

    if (session.type === "TRIAL_7DAY") {
        badge = <div className="absolute top-0 right-0 bg-purple-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl shadow-lg flex items-center gap-1"><Sparkles size={10} fill="white" /> 7-Day Free</div>;
        borderColor = "border-purple-500/50";
    }
    else if (session.type === "DAILY") {
        borderColor = "border-green-500/30";
    }
    else {
        borderColor = "border-blue-500/30";
    }

    const totalTime = 3600 * 4;
    const progress = (time / totalTime) * 100;

    const isTrial = session.type === "TRIAL_7DAY";

    return (
        <div
            onClick={onClick}
            className={`glass-panel p-4 shadow-lg relative overflow-hidden group transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] ${borderColor} cursor-pointer hover:bg-white/5`}>
            {/* ⚠️ Daily Pass Bar */}
            {session.type === "DAILY" && (
                <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                    <div className={`h-full transition-all duration-1000 ${progress < 20 ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-neon-cyan shadow-[0_0_10px_rgba(6,182,212,0.8)]'}`} style={{ width: `${progress}%` }}></div>
                </div>
            )}

            {badge}

            <div className="flex justify-between items-start mb-2 relative z-10 mt-1">
                <div className="flex items-center gap-3">
                    <img src={master?.avatar} alt={master?.name} className="w-10 h-10 rounded-full border-2 border-white/10 group-hover:border-neon-purple transition-colors" />
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">Active</p>
                        <p className="font-bold text-sm text-white">{master?.name}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[9px] text-gray-400">Allocated</p>
                    <p className="text-xs font-bold font-mono text-white">{currencySymbol}{allocation}</p>
                </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-2">
                <div className="flex gap-3">
                    {/* Guard Removed */}
                    {/* ✅ Session PnL (Prioritize Unrealized) */}
                    {(session.unrealizedPnL !== undefined || session.pnl !== undefined) && (
                        <span>
                            PnL: <span className={`font-bold ${(session.unrealizedPnL || session.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {(session.unrealizedPnL || session.pnl || 0) >= 0 ? "+" : ""}{(session.unrealizedPnL || session.pnl || 0).toFixed(2)}
                            </span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {session.type === "PAID" ? (
                        <span className="text-yellow-400 font-bold flex items-center gap-1 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]"><Crown size={10} /> Full Access</span>
                    ) : (
                        <span className={`font-mono font-bold flex items-center gap-1 ${isTrial ? "text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" : (time < 600 ? "text-red-500 animate-pulse" : "text-neon-cyan")}`}>
                            <Clock size={10} /> {timeDisplay}
                        </span>
                    )}
                </div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onStop(); }}
                className="w-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-bold py-2 rounded-lg flex justify-center items-center gap-2 hover:bg-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] transition-all active:scale-95">
                <StopCircle size={14} /> Stop Copy
            </button>
        </div>
    )
}
