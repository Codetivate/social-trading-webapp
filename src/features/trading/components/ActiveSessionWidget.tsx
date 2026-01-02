import { useState, useEffect } from "react";
import { Ticket, Sparkles, StopCircle, Crown, Clock } from "lucide-react";
import { Master, Session as CopySession } from "@/types";

interface ActiveSessionWidgetProps {
    master: Master;
    time: number;
    risk: number | string;
    allocation: number;
    onStop: () => void;
    isVip: boolean;
    session: CopySession;
}

export function ActiveSessionWidget({ master, time, risk, allocation, onStop, isVip, session }: ActiveSessionWidgetProps) {
    const [timeDisplay, setTimeDisplay] = useState("Loading...");

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

        if (session.type === "GOLDEN" || session.type === "TRIAL_7DAY" || session.type === "DAILY") {
            const label = session.type === "GOLDEN" ? "Golden" : session.type === "TRIAL_7DAY" ? "Trial" : "Daily";
            setTimeDisplay(`${formatTime(time)} (${label})`);
        } else {
            setTimeDisplay("Unlimited");
        }
    }, [time, session]);

    let badge = null;
    let borderColor = "border-gray-700";

    if (session.type === "GOLDEN") {
        badge = <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[9px] font-bold px-3 py-1 rounded-bl-xl shadow-lg flex items-center gap-1"><Ticket size={10} fill="black" /> Golden Ticket</div>;
        borderColor = "border-yellow-500/50";
    }
    else if (session.type === "TRIAL_7DAY") {
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

    const isTrialOrGolden = session.type && (session.type === "TRIAL_7DAY" || session.type === "GOLDEN");

    return (
        <div className={`glass-panel p-4 shadow-lg relative overflow-hidden group transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] ${borderColor}`}>
            {/* ⚠️ Daily Pass Bar */}
            {session.type === "DAILY" && !isVip && (
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
                    <p className="text-xs font-bold font-mono text-white">${allocation}</p>
                </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-2">
                <span>Guard: <span className="text-red-400 font-bold">-{risk}%</span></span>
                <div className="flex items-center gap-1">
                    {isVip || session.type === "PAID" ? (
                        <span className="text-yellow-400 font-bold flex items-center gap-1 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]"><Crown size={10} /> Full Access</span>
                    ) : (
                        <span className={`font-mono font-bold flex items-center gap-1 ${isTrialOrGolden ? "text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" : (time < 600 ? "text-red-500 animate-pulse" : "text-neon-cyan")}`}>
                            <Clock size={10} /> {timeDisplay}
                        </span>
                    )}
                </div>
            </div>
            <button onClick={onStop} className="w-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-bold py-2 rounded-lg flex justify-center items-center gap-2 hover:bg-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] transition-all active:scale-95"><StopCircle size={14} /> Stop Copy</button>
        </div>
    )
}
