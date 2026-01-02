"use client";

import React, { useState, useEffect } from "react";
import { Users, Briefcase, Ticket, Clock, Crown } from "lucide-react";
import { UserRole, AccountStatus } from "@/types";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavbarProps {
    viewMode: UserRole;
    onSwitch: (mode: UserRole) => void;
    wallet: number;
    status: AccountStatus;
    isLoggedIn?: boolean; // Optional now
    isVip: boolean;
    goldenTickets: number;
    goldenTicketExpiry: number;
    goldenTicketStart?: number;
    onLogin: () => void;
    onOpenSettings: () => void;
    onOpenVIP: () => void;
    onBecomeMaster?: () => void;
}

export function Navbar({ viewMode, onSwitch, wallet, status, isLoggedIn: propsIsLoggedIn, isVip, goldenTickets, goldenTicketExpiry, goldenTicketStart, onLogin, onOpenSettings, onOpenVIP, onBecomeMaster }: NavbarProps) {
    const { data: session } = useSession();
    const isAuthenticated = !!session || propsIsLoggedIn;

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
        <nav className="fixed top-0 w-full z-40 glass-panel pt-3 pb-3 px-4">
            <div className="flex justify-between items-center">
                <Link href="/" className="flex items-center gap-3 cursor-pointer group">
                    {/* 🔹 LOGO: SignalTrade w/ Neon Glow */}
                    <div className="relative w-8 h-8 transition-transform duration-300 group-hover:scale-110">
                        <div className="absolute inset-0 bg-neon-purple/50 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_10px_rgba(139,92,246,0.5)] relative z-10">
                            <rect width="40" height="40" rx="12" fill="white" />
                            <path d="M10 20H15L19 9L23 31L27 20H30" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="hidden sm:block">
                        <span className="text-premium text-lg leading-none">SignalTrade</span>
                    </div>
                </Link>
                <div className="flex bg-space p-1 rounded-full border border-white/10 relative shadow-inner">
                    <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(139,92,246,0.3)] ${viewMode === "MASTER" ? "left-[calc(50%+2px)] bg-neon-purple" : "left-[2px] bg-neon-cyan"}`}></div>
                    <button onClick={() => onSwitch("FOLLOWER")} className={`relative z-10 px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${viewMode === "FOLLOWER" ? "text-white" : "text-gray-400 hover:text-white"}`}><Users size={12} /> Follower</button>
                    <button onClick={() => onSwitch("MASTER")} className={`relative z-10 px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${viewMode === "MASTER" ? "text-white" : "text-gray-400 hover:text-white"}`}><Briefcase size={12} /> Master</button>
                </div>
                <div className="flex items-center gap-2">
                    {onBecomeMaster && viewMode === "FOLLOWER" && isAuthenticated && (
                        <button onClick={onBecomeMaster} className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-neon-purple to-indigo-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:shadow-neon-purple/60 transition-all active:scale-95 border border-white/10">
                            <Briefcase size={12} /> Become Master
                        </button>
                    )}
                    {isAuthenticated ? (
                        <>
                            {goldenTickets > 0 && !isGoldenActive && !isVip && (
                                <div className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded-full border border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                                    <Ticket size={12} fill="currentColor" />
                                    <span className="text-[10px] font-bold">{goldenTickets}</span>
                                </div>
                            )}
                            {(isGoldenActive || isVip) && (
                                <div className="flex items-center gap-2 group relative cursor-help">
                                    <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 px-2.5 py-1 rounded-full border border-yellow-500/30 glow-purple">
                                        <Clock size={12} />
                                        <span className="text-[10px] font-bold">{isVip ? "VIP Active" : `${daysLeft}d left`}</span>
                                    </div>
                                    <div className="absolute top-full right-0 mt-2 w-48 glass-panel rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-2 flex items-center gap-1"><Ticket size={10} className="text-yellow-500" /> Golden Ticket Period</p>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-400">Start:</span>
                                                <span className="text-white font-mono">{goldenTicketStart ? formatDateTime(goldenTicketStart) : "-"}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-400">End:</span>
                                                <span className="text-white font-mono">{goldenTicketExpiry ? formatDateTime(goldenTicketExpiry) : "Unlimited"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div onClick={onOpenSettings} className="cursor-pointer relative group">
                                <Avatar className={`h-8 w-8 transition-all duration-300 ${isGoldenActive || isVip
                                    ? "ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] scale-105"
                                    : "ring-2 ring-white/10 hover:ring-neon-cyan shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                                    }`}>
                                    <AvatarImage src={session?.user?.image || ""} />
                                    <AvatarFallback className="bg-space text-white">{session?.user?.name?.[0] || "U"}</AvatarFallback>
                                </Avatar>
                                {(isGoldenActive || isVip) && (
                                    <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-full p-0.5 shadow-lg border border-white/20 animate-in zoom-in spin-in-3">
                                        <div className="bg-black/20 rounded-full p-[2px]">
                                            <Crown size={8} className="text-white fill-yellow-200" />
                                        </div>
                                    </div>
                                )}
                            </div>

                        </>
                    ) : (
                        <button onClick={onLogin} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]">Login</button>
                    )}
                </div>
            </div>
        </nav>
    );
}

// 📅 Christian Era Date Formatter
const formatDateTime = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        calendar: 'gregory'
    }).format(new Date(timestamp));
};

