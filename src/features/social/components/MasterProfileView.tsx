"use client";
import { getGMTOffset, calculateDaysActive } from "@/lib/utils";

// ... (imports remain)
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Heart, TrendingUp, DollarSign, Users, Award, Shield, CheckCircle2, History, X, Square, ArrowRight, Wallet, Lock, Share2, Settings, Bot, ShieldCheck, Ticket, Sparkles, Copy, Monitor, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Master, SessionType, UserRole, AccountStatus } from "@/types";
import { AnalyticStats, EquityPoint, MonthlyResult, SymbolDistribution } from "@/app/actions/analytics";
import { SafetyGuardModal } from "@/features/trading/components/SafetyGuardModal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { SocialShareModal } from "@/features/social/components/SocialShareModal";
import TraderAnalysisDashboard from "@/features/social/components/TraderAnalysisDashboard";
import { getUserIdByName } from "@/app/actions/data";
import { refreshMasterStats } from "@/app/actions/trade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { io } from "socket.io-client";

interface MasterProfileViewProps {
    master: Master;
    onBack: () => void;
    requireAuth: (action: () => void) => void;
    // Removing isPreview
    isFav?: boolean;
    onToggleFav?: () => void;
    onStartCopy: (master: Master, amount: number, risk: number | string, sessionType: SessionType, advanced?: { autoRenew: boolean, timeConfig: any, invertCopy?: boolean, copyMode?: "FIXED" | "EQUITY" }) => void;
    onStopCopy: (id: number, confirmed?: boolean) => void;
    isCopying?: boolean;
    maxAlloc?: number;
    userRole?: UserRole;
    hasUsed7DayTrial?: boolean;
    accountStatus?: AccountStatus;
    onOpenSettings?: () => void;
    dailyTicketUsed?: boolean;
    isOwner?: boolean;
    initialAnalytics?: {
        stats: AnalyticStats;
        equityCurve: EquityPoint[];
        monthlyResults: MonthlyResult[];
        symbolDist: SymbolDistribution[];
        history: any[];
    } | null;
}

export function MasterProfileView({ master, onBack, requireAuth, isFav, onToggleFav, onStartCopy, onStopCopy, isCopying, maxAlloc, hasUsed7DayTrial, userRole, accountStatus, onOpenSettings, dailyTicketUsed, isOwner, initialAnalytics }: MasterProfileViewProps) {
    const [localMaster, setLocalMaster] = useState(master);

    // 🔄 Sync Prop Updates (Fixes "Stale Data" on switching profiles or revalidation)
    useEffect(() => {
        setLocalMaster(master);
    }, [master]); // ✅ Local State for Realtime
    const [isShareOpen, setIsShareOpen] = useState(false); // ✅ Share State
    // 📊 Analytics State (Lifted from Child or Initial)
    const [analyticsData, setAnalyticsData] = useState(initialAnalytics);

    const handleDataLoaded = useCallback((data: any) => {
        setAnalyticsData(data);
    }, []);

    // Sync Prop Changes

    // Sync Prop Changes
    useEffect(() => {
        setLocalMaster(master);
    }, [master]);

    // Calculate current monthly profit from analytics
    const currentMonthResults = analyticsData?.monthlyResults?.length
        ? analyticsData.monthlyResults[analyticsData.monthlyResults.length - 1]
        : null;

    const currentMonthProfitAbs = currentMonthResults?.profit || 0;
    // Estimate Month ROI: (Profit / (CurrentBalance - Profit)) * 100
    // If balance is 0 or missing, fallback to 0 to avoid Infinity
    // Use analytics balance if available, else localMaster balance
    const currentBalance = analyticsData?.stats?.balance || localMaster.balance || 1;
    const prevBalance = currentBalance - currentMonthProfitAbs;
    const currentMonthROI = prevBalance > 0 ? (currentMonthProfitAbs / prevBalance) * 100 : 0;

    // ⚡ SOCKET LISTENER
    useEffect(() => {
        // Connect to Socket Server (Port 3001 default)
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3001` : "http://localhost:3001");

        const socket = io(socketUrl);

        socket.on("connect", () => {
            // console.log("MasterView Socket Connected");
        });

        socket.on("master_updated", (updatedProfile: any) => {
            // Check if update belongs to current master
            // Prisma returns 'userId', verify against current master id/userId
            if (
                updatedProfile.userId === localMaster.userId ||
                updatedProfile.id === localMaster.id ||
                (updatedProfile.username && localMaster.username && updatedProfile.username === localMaster.username)
            ) {
                console.log("Received Realtime Update!", updatedProfile);
                setLocalMaster(prev => ({
                    ...prev,
                    ...updatedProfile,
                    // Ensure crucial UI fields are mapped if naming differs
                    name: updatedProfile.name || prev.name,
                    desc: updatedProfile.desc || prev.desc,
                    minDeposit: updatedProfile.minDeposit ?? prev.minDeposit,
                    leverage: updatedProfile.leverage ?? prev.leverage, // Leverage might come from broker acc, careful
                    monthlyFee: updatedProfile.monthlyFee ?? prev.monthlyFee,
                    avatar: updatedProfile.avatar || prev.avatar
                }));
                toast.success("Profile Updated Real-Time");
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [localMaster.userId, localMaster.id]);

    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [aiGuardRisk, setAiGuardRisk] = useState<number | string>(100);
    const [allocation, setAllocation] = useState<number | string>(1000);
    const [selectedSessionType, setSelectedSessionType] = useState<SessionType>("DAILY");
    const [useWelcomeTicket, setUseWelcomeTicket] = useState(false);

    // Risk Popover State
    const [isRiskOpen, setIsRiskOpen] = useState(false);

    // ⚙️ Advanced Settings State (Lifted)
    const [autoRenew, setAutoRenew] = useState(true); // Default ON
    const [timeConfig, setTimeConfig] = useState<any>({ mode: "24/7", start: "09:00", end: "17:00" }); // Default 24/7
    const [invertCopy, setInvertCopy] = useState(false);

    const [resolvedUserId, setResolvedUserId] = useState<string | null>(localMaster.masterUserId || localMaster.userId || null);

    useEffect(() => {
        if (localMaster.masterUserId || localMaster.userId) {
            setResolvedUserId(localMaster.masterUserId || localMaster.userId || null);
            return;
        }
        let isMounted = true;
        getUserIdByName(localMaster.name).then(id => {
            if (isMounted && id) setResolvedUserId(id);
        });
        return () => { isMounted = false; };
    }, [localMaster]);

    // 🔄 Self-Healing Stats (Exclude Self-Copy from AUM)
    // 🔄 Auto-Refresh Stats (Risk, AUM, Followers) on Mount
    useEffect(() => {
        // Always refresh to ensure Risk Score and AUM are up-to-date with DB logic
        if (localMaster.userId) {
            refreshMasterStats(localMaster.userId)
                .then((res) => {
                    if (res.success) {
                        const data = res as any;
                        setLocalMaster(prev => ({
                            ...prev,
                            risk: data.riskScore || 1,
                            aum: data.aum || 0,
                            followers: data.followersCount || 0,
                            drawdown: data.drawdown || 0,
                            joined: data.joined || prev.joined // ✅ Sync Accurate Join Date
                        }));
                    }
                })
                .catch(err => console.error("Stats Refresh Failed", err));
        }
    }, [localMaster.userId]);

    const isPremium = localMaster.monthlyFee > 0;
    const canUse7DayTrial = isPremium && !hasUsed7DayTrial;

    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; type: "info" | "danger" | "success" | "warning"; onConfirm: () => void }>({ isOpen: false, title: "", message: "", type: "info", onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void, type: "info" | "danger" | "success" | "warning" = "info") => {
        setConfirmModal({ isOpen: true, title, message, type, onConfirm });
    };

    const handleCopyAction = () => {
        if (userRole === "MASTER") {
            openConfirm("Spy Mode", "👀 You are in Master View (Spy Mode).\nCopying is disabled for your role.", () => { }, "warning");
            return;
        }

        // Is this my own profile (even as follower)?
        // FTMODashboard handles "isOwnProfile", but for copying...
        // A user shouldn't copy themselves, but the ID check (Master vs User) handles that usually.

        if (isCopying) {
            openConfirm("Stop Copying?", `Are you sure you want to stop copying ${localMaster.name}?`, () => { onStopCopy(localMaster.id, true); setConfirmModal(prev => ({ ...prev, isOpen: false })); }, "danger");
        }
        else {
            if (accountStatus !== "CONNECTED") {
                toast.error("Broker Not Connected", { description: "Please connect your MT5 Broker Account first!" });
                if (onOpenSettings) onOpenSettings();
                return;
            }

            if (isPremium) {
                if (canUse7DayTrial) {
                    openConfirm(
                        "🎁 Special 7-Day Trial",
                        `Start your 7-Day Free Trial with ${localMaster.name}?\n\nThis is a one-time offer.`,
                        () => {
                            setSelectedSessionType("TRIAL_7DAY");
                            requireAuth(() => setSafetyModalOpen(true));
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        },
                        "success"
                    );
                } else {
                    toast.error("Premium Access Required", { description: "You need a subscription to copy this master." });
                }
                return;
            }

            setSelectedSessionType("DAILY");
            if (dailyTicketUsed && !hasUsed7DayTrial) {
                setUseWelcomeTicket(true);
            } else {
                setUseWelcomeTicket(false);
            }
            requireAuth(() => setSafetyModalOpen(true));
        }
    };

    return (
        <div className="fixed inset-0 bg-background z-50 overflow-y-auto pb-32 animate-in fade-in duration-200">

            {/* HEADER */}
            <div className="border-b border-border sticky top-0 z-100 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
                <div className="flex items-center justify-between p-4 max-w-7xl mx-auto">
                    {/* Header: Back & Favorite */}
                    <div className="flex justify-between items-center w-full">
                        <button onClick={onBack} className="p-2.5 -ml-2 text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition-all active:scale-95 group z-50">
                            <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsShareOpen(true)} className="p-2.5 text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition-all active:scale-95 z-50 md:hidden">
                                <Share2 size={20} />
                            </button>
                            {!isOwner && (
                                <button onClick={onToggleFav} className={`p-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all active:scale-95 z-50 ${isFav ? "bg-red-500/10 border-red-500/50 text-red-500" : "bg-black/40 border-white/10 text-white hover:bg-black/60"}`}>
                                    <Heart size={20} fill={isFav ? "currentColor" : "none"} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-8">

                {/* 1. PREMIUM PROFILE HEADER (Neon Dark Theme) */}
                <div className="relative overflow-hidden rounded-3xl p-6 md:p-10 bg-linear-to-br from-[#0a0a0a] to-[#111] border border-white/5 shadow-2xl">
                    {/* Decorative Background Elements */}
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/5 blur-[100px] rounded-full pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row gap-8 md:gap-12 items-start">
                        {/* LEFT: Avatar & Identity */}
                        <div className="flex flex-col items-center gap-4 shrink-0 mx-auto md:mx-0">
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-linear-to-r from-cyan-500 to-purple-600 rounded-full opacity-30 group-hover:opacity-70 blur transition-opacity duration-500"></div>
                                <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-[#0a0a0a] shadow-2xl relative z-10">
                                    <AvatarImage src={localMaster.avatar} className="object-cover" />
                                    <AvatarFallback className="bg-gray-800 text-2xl font-bold text-gray-400">{localMaster.name.substring(0, 2)}</AvatarFallback>
                                </Avatar>

                            </div>

                            <div className="text-center space-y-1">
                                <div className="flex items-center gap-1.5 justify-center px-3 py-1 bg-white/5 rounded-full border border-white/5 backdrop-blur-sm">
                                    <CalendarDays size={12} className="text-gray-500" />
                                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                                        Joined {localMaster.joined ? new Date(localMaster.joined).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"} <span className="text-gray-600">|</span> <span className="text-neon-cyan font-bold">{calculateDaysActive(localMaster.joined)} Days</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Info & Stats */}
                        <div className="flex-1 w-full space-y-6 text-center md:text-left">
                            {/* Name & Risk Badge */}
                            <div className="space-y-3">
                                <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white flex flex-row flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4">
                                            {localMaster.name}
                                            <div className="flex items-center gap-2">
                                                {localMaster.type === "AI_BOT" && <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20">AI</Badge>}
                                                {/* RISK BADGE - GLOBAL STANDARD */}
                                                <div className="flex items-center gap-3 pl-4 border-l border-white/10 ml-2 h-full">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <Popover open={isRiskOpen} onOpenChange={setIsRiskOpen}>
                                                            <PopoverTrigger asChild>
                                                                <div
                                                                    className="cursor-help group/risk"
                                                                    onMouseEnter={() => setIsRiskOpen(true)}
                                                                    onMouseLeave={() => setIsRiskOpen(false)}
                                                                    onClick={() => setIsRiskOpen(!isRiskOpen)}
                                                                >
                                                                    <div className={`flex items-center gap-1.5 px-3 py-1 border rounded-md transition-colors ${localMaster.risk <= 1 ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20 text-green-500" :
                                                                        localMaster.risk === 2 ? "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-500" :
                                                                            localMaster.risk === 3 ? "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20 text-yellow-500" :
                                                                                localMaster.risk === 4 ? "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 text-orange-500" :
                                                                                    "bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-500"
                                                                        }`}>
                                                                        <span className="text-[10px] font-bold uppercase tracking-widest leading-none opacity-80">RISK:</span>
                                                                        <span className="text-sm font-black leading-none">{localMaster.risk}</span>
                                                                    </div>
                                                                </div>
                                                            </PopoverTrigger>
                                                            <PopoverContent
                                                                side="bottom"
                                                                align="center"
                                                                className="w-64 p-4 rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl shadow-2xl text-center space-y-3 z-150"
                                                            >
                                                                {/* (Tooltip Content Omitted for Brevity - Keeping Existing) */}
                                                                <div className="space-y-1">
                                                                    <h4 className="font-bold text-white">What is Risk?</h4>
                                                                    <p className="text-xs text-gray-400">
                                                                        {localMaster.risk <= 2 ? "Low Volatility detected. Safe and consistent strategy." :
                                                                            localMaster.risk === 3 ? "Moderate Activity. Balanced approach." :
                                                                                "High Activity detected. Strategy involves high volatility or significant drawdown."}
                                                                    </p>
                                                                </div>

                                                                {/* GAUGE */}
                                                                <div className="relative w-full h-24 mx-auto flex items-end justify-center pb-2">
                                                                    <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                                                        {/* Background Track */}
                                                                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1f2937" strokeWidth="6" strokeLinecap="round" />
                                                                        {/* Gradient Define */}
                                                                        <defs>
                                                                            <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                                                <stop offset="0%" stopColor="#22c55e" /> {/* Green */}
                                                                                <stop offset="40%" stopColor="#3b82f6" /> {/* Blue */}
                                                                                <stop offset="70%" stopColor="#eab308" /> {/* Yellow */}
                                                                                <stop offset="100%" stopColor="#ef4444" /> {/* Red */}
                                                                            </linearGradient>
                                                                        </defs>
                                                                        {/* Value Arc */}
                                                                        <path
                                                                            d="M 10 50 A 40 40 0 0 1 90 50"
                                                                            fill="none"
                                                                            stroke="url(#riskGradient)"
                                                                            strokeWidth="6"
                                                                            strokeLinecap="round"
                                                                            strokeDasharray="126"
                                                                            strokeDashoffset={126 - ((localMaster.risk / 5) * 126)}
                                                                            className="transition-all duration-1000 ease-out"
                                                                        />
                                                                        {/* Numbers (Moved UP to avoid overlapping Safe/Aggr) */}
                                                                        <text x="10" y="58" fill="#22c55e" fontSize="5" fontWeight="bold" textAnchor="middle">1</text>
                                                                        <text x="30" y="30" fill="#3b82f6" fontSize="5" fontWeight="bold" textAnchor="middle">2</text>
                                                                        <text x="50" y="18" fill="#eab308" fontSize="5" fontWeight="bold" textAnchor="middle">3</text>
                                                                        <text x="70" y="30" fill="#f97316" fontSize="5" fontWeight="bold" textAnchor="middle">4</text>
                                                                        <text x="90" y="58" fill="#ef4444" fontSize="5" fontWeight="bold" textAnchor="middle">5</text>
                                                                    </svg>

                                                                    {/* Risk Label - Dynamic Color & Positioned */}
                                                                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-[#0a0a0a] px-3 py-1 rounded-full border border-white/10 text-[10px] font-bold shadow-xl z-10">
                                                                        Risk Score: <span className={
                                                                            localMaster.risk === 1 ? "text-green-500" :
                                                                                localMaster.risk === 2 ? "text-blue-500" :
                                                                                    localMaster.risk === 3 ? "text-yellow-500" :
                                                                                        localMaster.risk === 4 ? "text-orange-500" : "text-red-500"
                                                                        }>{localMaster.risk}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between text-[10px] text-gray-500 px-2 font-mono mt-2">
                                                                    <span>Safe</span>
                                                                    <span>Aggressive</span>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>
                                                </div>

                                                {/* 🛠️ OWNER REFRESH BUTTON */}

                                            </div>


                                        </h1>
                                        <p className="text-gray-400 text-sm md:text-base font-medium max-w-2xl mx-auto md:mx-0 leading-relaxed">
                                            {localMaster.desc || "Professional strategy focusing on risk management and consistent growth."}
                                        </p>
                                    </div>

                                    {/* Action Button (Top Right Desktop) */}
                                    <div className="hidden md:flex gap-3">
                                        <button
                                            onClick={() => setIsShareOpen(true)}
                                            className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white transition-all active:scale-95"
                                            title="Share Profile"
                                        >
                                            <Share2 size={20} />
                                        </button>

                                        {!isOwner && (
                                            <button
                                                onClick={handleCopyAction}
                                                className={`px-8 py-3 rounded-xl font-bold shadow-lg shadow-purple-900/20 transition-all transform hover:scale-105 active:scale-95 ${isCopying ? "bg-red-600 text-white" : "bg-white text-black hover:bg-gray-200"}`}
                                            >
                                                {isCopying ? "Stop Copying" : "Copy Strategy"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                                    {localMaster.tags?.map((tag, i) => (
                                        <div key={i} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-1.5 max-w-[200px]" title={tag}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                            <span className="truncate">{tag}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Separator className="bg-white/5" />

                            {/* 4-Col Stats Grid (Integrated) */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                                <div className="p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 hover:border-white/10 transition-colors text-center group">
                                    <div className="mb-2 w-10 h-10 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Users className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div className="text-2xl font-black text-white">{localMaster.followers.toLocaleString()}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Copiers</div>
                                </div>

                                <div className="p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 hover:border-white/10 transition-colors text-center group">
                                    <div className="mb-2 w-10 h-10 mx-auto rounded-full bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Wallet className="w-5 h-5 text-green-400" />
                                    </div>
                                    <div className="text-2xl font-black text-white">${localMaster.minDeposit}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Min Deposit</div>
                                </div>

                                <div className="p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 hover:border-white/10 transition-colors text-center group">
                                    <div className="mb-2 w-10 h-10 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <TrendingUp className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div className="text-2xl font-black text-white">{localMaster.leverage ? `1:${localMaster.leverage}` : "1:500"}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Leverage</div>
                                </div>

                                <div className="p-4 rounded-2xl bg-[#0f0f0f] border border-white/5 hover:border-white/10 transition-colors text-center group">
                                    <div className="mb-2 w-10 h-10 mx-auto rounded-full bg-yellow-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Award className="w-5 h-5 text-yellow-400" />
                                    </div>
                                    <div className="text-2xl font-black text-white">{isPremium ? `$${localMaster.monthlyFee}` : "Free"}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{isPremium ? "Monthly Fee" : "Access"}</div>
                                </div>
                            </div>
                        </div>

                        {/* 2. TRADER ANALYSIS DASHBOARD (Analysis Always Visible) */}
                    </div>
                </div>

                {/* 2. TRADER ANALYSIS DASHBOARD (Analysis Always Visible) */}
                <Separator className="bg-white/10" />

                <div className="min-h-[500px]">
                    <TraderAnalysisDashboard
                        masterId={resolvedUserId || ""}
                        isOwnProfile={localMaster.id === 0}
                        initialAnalytics={initialAnalytics}
                        onDataLoaded={handleDataLoaded}
                    />

                </div>
            </div >


            {/* 3. STICKY FOOTER (ACTION BAR) - Hide if Own Profile (id === 0) */}
            {/* Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-50 animate-in slide-in-from-bottom-4">
                <div className="max-w-xl mx-auto flex items-center justify-center gap-4">
                    {isOwner ? (
                        <Button
                            size="lg"
                            className="w-full md:w-auto font-bold shadow-lg bg-white text-black hover:bg-gray-200"
                            onClick={onOpenSettings}
                        >
                            <Settings className="mr-2 h-4 w-4" /> Edit Profile
                        </Button>
                    ) : (
                        <Button
                            size="lg"
                            className={`w-full md:w-auto font-bold shadow-lg ${isCopying ? "bg-red-600 hover:bg-red-700 text-white" :
                                canUse7DayTrial ? "bg-purple-600 hover:bg-purple-700 text-white" :
                                    "bg-primary hover:bg-primary/90"
                                }`}
                            onClick={handleCopyAction}
                        >
                            {isCopying ? (
                                <>Stop Copying</>
                            ) : canUse7DayTrial ? (
                                <><Sparkles className="mr-2 h-4 w-4" /> Start 7-Day Trial</>
                            ) : (
                                "Start Copying"
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {
                safetyModalOpen && (
                    <SafetyGuardModal
                        // key={Date.now()} // 🧹 Removed to prevent flicking (frequent remounts)
                        initialRisk={20} // Legacy
                        initialAllocation={allocation}
                        initialProRata={Number(aiGuardRisk) || 100} // ✅ Persist Pro-Rata
                        maxAlloc={maxAlloc || 0}
                        initialAutoRenew={autoRenew}
                        initialTimeConfig={timeConfig}
                        initialInvert={invertCopy}
                        initialUseWelcome={useWelcomeTicket}
                        showWelcomeOption={!hasUsed7DayTrial && selectedSessionType === "DAILY"}
                        onClose={() => setSafetyModalOpen(false)}
                        onConfirm={(data) => {
                            // Persist preferences locally if needed
                            setAiGuardRisk(data.proRataPercent); // ✅ Save Pro-Rata
                            setAllocation(data.allocation);
                            setAutoRenew(data.autoRenew);
                            setTimeConfig(data.timeConfig);
                            setInvertCopy(data.invertCopy);

                            const finalType = (selectedSessionType === "DAILY" && data.useWelcome) ? "TRIAL_7DAY" : selectedSessionType;
                            // ✅ Uses proRataPercent as Risk Factor
                            console.log("👤 MasterProfileView received data:", data);
                            onStartCopy(localMaster, data.allocation, data.proRataPercent, finalType, { autoRenew: data.autoRenew, timeConfig: data.timeConfig, invertCopy: data.invertCopy, copyMode: data.copyMode });


                            setSafetyModalOpen(false);
                            setUseWelcomeTicket(false);
                            // onBack(); // Stay on page
                        }}
                    />
                )
            }

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
            />

            <SocialShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                master={{
                    ...localMaster,
                    monthlyProfit: Number(currentMonthROI.toFixed(1)) // Pass PERCENTAGE now
                }}
                stats={{
                    roi: analyticsData?.stats?.growth ?? localMaster.roi,
                    aum: analyticsData?.stats?.balance ?? localMaster.aum ?? localMaster.balance ?? 0,
                    copiers: analyticsData?.stats?.totalTrades ? localMaster.followers : localMaster.followers,
                    drawdown: (analyticsData?.stats?.maxDrawdown && analyticsData.stats.maxDrawdown > 0)
                        ? analyticsData.stats.maxDrawdown
                        : (localMaster.drawdown || 0)
                }}
            />
        </div >
    )
}
