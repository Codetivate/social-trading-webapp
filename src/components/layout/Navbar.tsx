import React, { useState, useEffect } from "react";
import { Users, Briefcase, Ticket, Clock, Crown } from "lucide-react";
import { UserRole, AccountStatus } from "@/types";

interface NavbarProps {
    viewMode: UserRole;
    onSwitch: (mode: UserRole) => void;
    wallet: number;
    status: AccountStatus;
    isLoggedIn: boolean;
    isVip: boolean;
    goldenTickets: number;
    goldenTicketExpiry: number;
    goldenTicketStart?: number;
    onLogin: () => void;
    onOpenSettings: () => void;
    onOpenVIP: () => void;
    onBecomeMaster?: () => void;
}

export function Navbar({ viewMode, onSwitch, wallet, status, isLoggedIn, isVip, goldenTickets, goldenTicketExpiry, goldenTicketStart, onLogin, onOpenSettings, onOpenVIP, onBecomeMaster }: NavbarProps) {

    const [daysLeft, setDaysLeft] = useState(0);
    const [isGoldenActive, setIsGoldenActive] = useState(false);

    useEffect(() => {
        const isActive = goldenTicketExpiry > Date.now();
        setIsGoldenActive(isActive);
        if (isActive) {
            setDaysLeft(Math.ceil((goldenTicketExpiry - Date.now()) / (1000 * 60 * 60 * 24)));
        }
    }, [goldenTicketExpiry]);

    return (
        <nav className="fixed top-0 w-full z-40 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800 pt-3 pb-3 px-4 shadow-2xl">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 cursor-pointer" onClick={onOpenSettings}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-inner relative transition-colors duration-500 ${viewMode === 'MASTER' ? 'bg-gradient-to-br from-purple-600 to-indigo-600' : 'bg-gradient-to-br from-blue-600 to-cyan-500'}`}>
                        B {isLoggedIn && <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${status === 'CONNECTED' ? 'bg-green-500' : 'bg-red-500'}`}></div>}
                    </div>
                    <span className="font-bold text-base tracking-tight hidden sm:block">Bridge</span>
                </div>
                <div className="flex bg-gray-900 p-1 rounded-full border border-gray-700/50 relative">
                    <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-gray-700 rounded-full transition-all duration-300 ${viewMode === "MASTER" ? "left-[calc(50%+2px)] bg-purple-600" : "left-[2px] bg-blue-600"}`}></div>
                    <button onClick={() => onSwitch("FOLLOWER")} className={`relative z-10 px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${viewMode === "FOLLOWER" ? "text-white" : "text-gray-400 hover:text-white"}`}><Users size={12} /> Follower</button>
                    <button onClick={() => onSwitch("MASTER")} className={`relative z-10 px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${viewMode === "MASTER" ? "text-white" : "text-gray-400 hover:text-white"}`}><Briefcase size={12} /> Master</button>
                </div>
                <div className="flex items-center gap-2">
                    {onBecomeMaster && viewMode === "FOLLOWER" && isLoggedIn && (
                        <button onClick={onBecomeMaster} className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg hover:shadow-purple-500/25 transition-all active:scale-95 border border-white/10">
                            <Briefcase size={12} /> Become Master
                        </button>
                    )}
                    {isLoggedIn ? (
                        <>
                            {/* Golden Ticket / VIP Badge */}
                            {goldenTickets > 0 && !isGoldenActive && !isVip && (
                                <div className="hidden sm:flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full border border-yellow-500/30">
                                    <Ticket size={12} fill="currentColor" />
                                    <span className="text-[10px] font-bold">{goldenTickets}</span>
                                </div>
                            )}
                            {(isGoldenActive || isVip) && (
                                <div className="hidden sm:flex items-center gap-2 group relative cursor-help">
                                    <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 text-yellow-400 px-2.5 py-1 rounded-full border border-yellow-500/30">
                                        <Clock size={12} />
                                        <span className="text-[10px] font-bold">{isVip ? "VIP Active" : `${daysLeft}d left`}</span>
                                    </div>
                                    {/* 📅 Date Tooltip */}
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-2 flex items-center gap-1"><Ticket size={10} className="text-yellow-500" /> Golden Ticket Period</p>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-400">Start:</span>
                                                <span className="text-white font-mono">{goldenTicketStart ? new Date(goldenTicketStart).toLocaleDateString() : "-"}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-400">End:</span>
                                                <span className="text-white font-mono">{goldenTicketExpiry ? new Date(goldenTicketExpiry).toLocaleDateString() : "Unlimited"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col items-end"><span className="text-[10px] font-mono font-bold text-green-400">${wallet.toLocaleString()}</span><span className="text-[8px] text-gray-500">Available</span></div>
                            <button onClick={onOpenVIP} className={`w-8 h-8 rounded-full flex items-center justify-center text-black shadow-lg active:scale-95 transition-transform ${isVip || isGoldenActive ? "bg-gradient-to-tr from-yellow-300 to-orange-500 shadow-orange-500/30" : "bg-gray-700 text-gray-400"}`}><Crown size={14} fill={isVip || isGoldenActive ? "black" : "none"} /></button>
                        </>
                    ) : (
                        <button onClick={onLogin} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">Login</button>
                    )}
                </div>
            </div>
        </nav>
    );
}

