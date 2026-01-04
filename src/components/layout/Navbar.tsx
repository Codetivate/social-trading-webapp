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
    onOpenSettings: () => void;
    onLogin: () => void;
    onBecomeMaster?: () => void;
    onOpenWallet?: () => void;
}

export function Navbar({ viewMode, onSwitch, wallet, status, isLoggedIn: propsIsLoggedIn, onLogin, onOpenSettings, onBecomeMaster, onOpenWallet }: NavbarProps) {
    const { data: session } = useSession();
    const isAuthenticated = !!session || propsIsLoggedIn;

    const [daysLeft, setDaysLeft] = useState(0);


    useEffect(() => {
        // Logic for daysLeft removed as VIP is gone
    }, []);

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




                            <div onClick={onOpenSettings} className="cursor-pointer relative group">
                                <Avatar className={`h-8 w-8 transition-all duration-300 ring-2 ring-white/10 hover:ring-neon-cyan shadow-[0_0_15px_rgba(6,182,212,0.3)]`}>
                                    <AvatarImage src={session?.user?.image || ""} />
                                    <AvatarFallback className="bg-space text-white">{session?.user?.name?.[0] || "U"}</AvatarFallback>
                                </Avatar>

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

