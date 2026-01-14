"use client";



import { useSession, signOut } from "next-auth/react";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRealTimeData } from '@/hooks/useRealTimeData'; // ✅ Import Hook
import { Card, CardContent } from "@/components/ui/card";
// Actions
import { connectBroker, getBrokerAccount } from '@/app/actions/broker';
import { activateMasterAccount, updateMasterProfile, getUserProfile } from '@/app/actions/user';
import { fetchMasters, fetchFollower, fetchUserRole, fetchMasterByUsername } from '@/app/actions/data';
import { startCopySession, getActiveSessions, stopCopySession, stopAllActiveSessions, getTicketStatuses, refreshMasterStats } from '@/app/actions/trade';
import { BrokerAccount } from "@prisma/client";
// import { Session } from '@prisma/client'; // ❌ Removing Prisma Session to avoid conflict. Using custom type.

import { ChevronLeft, Heart, Bot, ShieldCheck, Ticket, Sparkles, Copy, Users, Wallet, TrendingUp, Radio, AlertTriangle, ArrowUpRight, BadgeCheck, Edit3, Briefcase, SlidersHorizontal, Lock, CheckCircle2, ChevronRight, Search, X, CalendarDays, Crown, Zap, PieChart, Sprout, ArrowUpDown, CreditCard, AlertOctagon, DollarSign, CheckCircle, Layers, Clock, Eye, Server, Activity } from "lucide-react";
import { MasterWalletModal } from "@/features/wallet/components/MasterWalletModal";
import { MasterProfileView } from "@/features/social/components/MasterProfileView";
import { MasterEquityChart } from "@/features/social/components/MasterEquityChart"; // ✅ New Chart
import { ActiveSessionWidget } from "@/features/trading/components/ActiveSessionWidget";
import { SafetyGuardModal } from "@/features/trading/components/SafetyGuardModal";
import { LoginModal } from "@/features/auth/components/LoginModal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { getUserIdByName } from "@/app/actions/data";
import { updateMasterPlan } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Transaction } from "@/features/wallet/types";
import { Navbar } from "@/components/layout/Navbar";
import { OpenPositionsTable } from "@/features/trading/components/OpenPositionsTable";
import { UserRole, AccountStatus, SessionType, Master, Session as CopySession, Follower, MasterProfile } from "@/types"; // ✅ Renamed Session to CopySession

// --- 📝 TYPESCRIPT INTERFACES (Moved to @/types) ---
// See src/types/index.ts


interface PlanDetails {
    id: string;
    name: string;
    price: string;
    priceVal: number;
    newLimit: number;
    newAum: number;
}

// --- MODAL PROPS INTERFACES ---
interface VIPUpgradeModalProps {
    onClose: () => void;
    onSuccess: () => void;
}


interface StopAllModalProps {
    onClose: () => void;
    onConfirm: () => void;
    count: number;
}

// ----------------------------------------------------------------------
// 0. API FETCH LOGIC
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// 0. API FETCH LOGIC (MOVED TO ACTIONS)
// ----------------------------------------------------------------------

interface PaymentModalProps {
    onClose: () => void;
    onSuccess: () => void;
    planDetails?: PlanDetails;
}

interface MasterActivationModalProps {
    onClose: () => void;
    onConfirm: (fee: number) => void;
}

interface MasterPlanModalProps {
    onClose: () => void;
    currentTier: string;
    onSelectPlan: (plan: any) => void;
}



// --- 📦 GLOBAL CONSTANTS & MOCK DATA ---
const INITIAL_BALANCE = 0;

const MOCK_BROKERS = [
    "Exness-MT5Real", "Exness-MT5Trial", "XMGlobal-MT5-Real",
    "ICMarkets-MT5-Live", "Pepperstone-MT5-01", "VantageFX-MT5-Live",
    "RoboForex-Pro-MT5"
];


// const mockFollowersList: Follower[] = [
//     { id: 101, name: "Somchai_Trader", equity: 1200, pnl: "+$45.00", joined: "2h ago", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Somchai" },
//     { id: 102, name: "Alice Wonderland", equity: 5000, pnl: "-$12.50", joined: "1d ago", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice" },
// ];


// 🗑️ MOCK DATA REMOVED: Using Real DB Data via /api/social/masters
// 🚀 MOCK DATA: High-Performance Masters for Demo
// 🗑️ Mocks Removed


// ----------------------------------------------------------------------
// 1. HELPER COMPONENTS (Defined FIRST)
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// 1. HELPER COMPONENTS (Mooved to @/components/layout)
// ----------------------------------------------------------------------




interface FilterButtonProps {
    label: string;
    active: boolean;
    onClick: () => void;
}

function FilterButton({ label, active, onClick }: FilterButtonProps) {
    return <button onClick={onClick} className={`px - 4 py - 2 rounded - full text - [10px] font - bold whitespace - nowrap border transition - all ${active ? "bg-white text-black border-white shadow-lg" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"} `}>{label}</button>
}

// 🎣 Infinite Scroll Hook
function useIntersectionObserver(
    callback: () => void,
    options: IntersectionObserverInit = { root: null, rootMargin: "200px", threshold: 0 }
) {
    const targetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                callback();
            }
        }, options);

        const currentTarget = targetRef.current;
        if (currentTarget) observer.observe(currentTarget);

        return () => {
            if (currentTarget) observer.unobserve(currentTarget);
        };
    }, [callback, options]);

    return targetRef;
}



// --- 2. MODAL COMPONENTS (Defined BEFORE Usage)
// ----------------------------------------------------------------------

import { FilterSortModal, FilterConfig } from "@/features/social/components/FilterSortModal";



// ----------------------------------------------------------------------
// 3. MAIN PAGE COMPONENT
// ----------------------------------------------------------------------

// function VIPUpgradeModal - Removed

function UniversalPaymentModal({ onClose, onSuccess, planDetails }: PaymentModalProps) {
    const isMasterUpgrade = !!planDetails;

    // Default to Payment Method since VIP is gone
    const [step, setStep] = useState<"PLAN" | "METHOD" | "PAYING" | "SUCCESS">("METHOD");

    const [paymentMethod, setPaymentMethod] = useState<"QR" | "CARD">("QR");

    // Only supports Master Upgrades now
    if (!isMasterUpgrade) return null;

    const title = `Upgrade to ${planDetails?.name}`;
    const price = planDetails?.priceVal;

    // ... Payment Logic (simplified for Master Plan only)
    const handlePay = async () => {
        setStep("PAYING");

        // Mock Success for Master Plan (Actual logic handles backend trigger elsewhere or placeholder)
        setTimeout(() => {
            setStep("SUCCESS");
            setTimeout(() => { if (onSuccess) onSuccess(); }, 1500);
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-space w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-neon-cyan/50 blur-lg"></div>
                <div className="p-4 flex items-center justify-between border-b border-white/5 bg-space/50 backdrop-blur z-20">
                    <div className="w-8"></div>
                    <h3 className="font-bold text-white text-premium">{step === "METHOD" ? "Payment" : step === "PAYING" ? "Processing..." : "Success!"}</h3>
                    <button onClick={onClose} className="bg-white/5 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>

                {step === "METHOD" && (
                    <div className="p-6 space-y-6 animate-in slide-in-from-right">
                        <div className="bg-gray-800 p-4 rounded-xl flex justify-between items-center border border-gray-700"><div><p className="text-xs text-gray-400">Item</p><p className="font-bold text-white">{title}</p></div><p className="text-xl font-bold text-green-400">${price}</p></div>
                        <div className="space-y-3"><p className="text-xs text-gray-400 font-bold uppercase">Select Payment Method</p><button onClick={() => setPaymentMethod("QR")} className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${paymentMethod === "QR" ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500" : "bg-gray-900 border-gray-700 hover:bg-gray-800"} `}><div className="flex items-center gap-3"><div className="bg-white p-1.5 rounded"><Radio size={20} className="text-blue-900" /></div><div className="text-left"><p className="font-bold text-sm text-white">Thai QR Payment</p><p className="text-[10px] text-gray-400">Scan with any bank app</p></div></div>{paymentMethod === "QR" && <CheckCircle2 className="text-blue-500" size={18} />}</button><button onClick={() => setPaymentMethod("CARD")} className={`w-full p-4 rounded-xl border flex items - center justify - between transition - all ${paymentMethod === "CARD" ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500" : "bg-gray-900 border-gray-700 hover:bg-gray-800"} `}><div className="flex items-center gap-3"><div className="bg-gray-700 p-1.5 rounded"><CreditCard size={20} className="text-white" /></div><div className="text-left"><p className="font-bold text-sm text-white">Credit / Debit Card</p><p className="text-[10px] text-gray-400">Visa, Mastercard, JCB</p></div></div>{paymentMethod === "CARD" && <CheckCircle2 className="text-blue-500" size={18} />}</button></div>
                        <button onClick={handlePay} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">Pay ${price}</button>
                    </div>
                )}

                {step === "PAYING" && (<div className="p-10 flex flex-col items-center justify-center space-y-4 animate-in fade-in h-[400px]"><div className="relative"><div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><Zap size={20} className="text-blue-500 animate-pulse" /></div></div><div className="text-center"><h3 className="text-white font-bold text-lg">Processing...</h3><p className="text-gray-500 text-xs">Confirming transaction</p></div></div>)}
                {step === "SUCCESS" && (<div className="p-10 flex flex-col items-center justify-center space-y-6 animate-in zoom-in h-[400px]"><div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/50 animate-bounce"><CheckCircle2 size={48} className="text-white" /></div><div className="text-center space-y-2"><h3 className="text-2xl font-bold text-white">Payment Success!</h3><p className="text-gray-400 text-sm">{isMasterUpgrade ? "Plan upgraded successfully." : "Success!"}</p></div></div>)}
            </div>
        </div>
    );
}



function StopAllModal({ onClose, onConfirm, count }: StopAllModalProps) {
    return (
        <div className="fixed inset-0 z-100 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95"><div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-red-500/50 shadow-2xl relative overflow-hidden"><div className="p-8 text-center space-y-6"><div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-red-900/20 animate-bounce"><AlertOctagon size={40} className="text-red-500" /></div><div><h2 className="text-2xl font-bold text-white mb-2">Emergency Stop?</h2><p className="text-gray-400 text-sm px-2">You are about to close <span className="text-white font-bold">{count} active portfolios</span>. All open positions will be closed at market price.</p></div><div className="space-y-3"><button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-3">YES, CLOSE EVERYTHING</button><button onClick={onClose} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3.5 rounded-xl">Cancel</button></div></div></div></div>
    )
}

function MasterActivationModal({ onClose, onConfirm }: MasterActivationModalProps) {
    const [isPaid, setIsPaid] = useState(false);
    const [fee, setFee] = useState<number | string>("");

    const handleConfirm = () => {
        const finalFee = isPaid ? Number(fee) : 0;
        if (isPaid && finalFee <= 0) {
            toast.error("Invalid Fee", { description: "Please enter a valid fee amount." });
            return;
        }
        onConfirm(finalFee);
    };

    return (
        <div className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-space w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-neon-purple/50 blur-lg"></div>
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-space/50">
                    <h3 className="font-bold text-premium text-white flex items-center gap-2"><Briefcase className="text-neon-purple" size={20} /> Become a Master</h3>
                    <button onClick={onClose} className="bg-white/5 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="text-center">
                        <p className="text-sm text-gray-300">Choose your subscription model to start earning from followers.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div
                            onClick={() => setIsPaid(false)}
                            className={`p - 4 rounded - xl border - 2 cursor - pointer transition - all ${!isPaid ? 'border-green-500 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'} `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase">Growth</span>
                                {!isPaid && <CheckCircle2 size={16} className="text-green-500" />}
                            </div>
                            <p className="text-xl font-bold text-white mb-1">Free</p>
                            <p className="text-[10px] text-gray-500">Best for building reputation and gaining followers quickly.</p>
                        </div>

                        <div
                            onClick={() => setIsPaid(true)}
                            className={`p - 4 rounded - xl border - 2 cursor - pointer transition - all ${isPaid ? 'border-yellow-500 bg-yellow-900/10' : 'border-gray-700 hover:border-gray-600'} `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase">Income</span>
                                {isPaid && <CheckCircle2 size={16} className="text-yellow-500" />}
                            </div>
                            <p className="text-xl font-bold text-white mb-1">Paid</p>
                            <p className="text-[10px] text-gray-500">Earn monthly revenue from your subscribers.</p>
                        </div>
                    </div>

                    {isPaid && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="text-xs text-gray-400 font-bold uppercase mb-2 block">Monthly Fee (USD)</label>
                            <div className="relative">
                                <DollarSign size={18} className="absolute left-3 top-3 text-green-500" />
                                <input
                                    type="number"
                                    value={fee}
                                    onChange={(e) => setFee(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-lg text-white focus:border-yellow-500 outline-none font-mono font-bold"
                                    placeholder="20"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 text-right">Platform Fee: 20%</p>
                        </div>
                    )}

                    <button onClick={handleConfirm} className="w-full bg-white text-black font-bold py-3.5 rounded-xl shadow-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                        <Sparkles size={18} className="text-purple-600" /> Activate Now
                    </button>
                </div>
            </div>
        </div>
    );
}

function MasterPlanModal({ onClose, currentTier, onSelectPlan }: MasterPlanModalProps) {
    const plans = [
        { id: "ROOKIE", name: "Rookie", icon: <Sprout size={24} />, price: "Free", limit: 10, aum: 50000, fee: "20%", desc: "Start building your track record with essential tools.", current: currentTier === "ROOKIE", newLimit: 10, newAum: 50000 },
        { id: "PRO", name: "Pro Trader", icon: <Zap size={24} />, price: "$30/mo", limit: 500, aum: 500000, fee: "10%", desc: "Expand your reach with higher limits and lower fees.", current: currentTier === "PRO", rec: true, newLimit: 500, newAum: 500000 },
        { id: "TYCOON", name: "Tycoon", icon: <Crown size={24} />, price: "$99/mo", limit: "Unlimited", aum: "Unlimited", fee: "5%", desc: "Maximum scale for institutional leaders.", current: currentTier === "TYCOON", newLimit: 999999, newAum: 999999999 }
    ];

    return (
        <div className="fixed inset-0 z-80 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-sans">

                {/* Header - Soft & Clean */}
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-950">
                    <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                            <TrendingUp size={24} className="text-green-500" />
                            Expand Business
                        </h3>
                        <p className="text-zinc-400 text-sm mt-1.5 font-medium">Select a plan to increase your capacity and keep more of your earnings.</p>
                    </div>
                    <button onClick={onClose} className="p-2.5 bg-zinc-900 rounded-full hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Cards */}
                <div className="overflow-y-auto p-6 md:p-10 bg-black/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <div
                                key={plan.id}
                                className={`relative p-8 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[400px] group
                                    ${plan.current
                                        ? "border-green-500/50 bg-zinc-900/50 shadow-[0_0_30px_rgba(34,197,94,0.1)]"
                                        : "border-white/5 bg-zinc-950 hover:border-white/10 hover:-translate-y-1 hover:shadow-xl"
                                    }
                                    ${plan.rec && !plan.current ? "border-purple-500/30" : ""}
                                `}
                            >
                                {plan.rec && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">Most Popular</div>}

                                <div>
                                    <div className={`mb-6 p-4 rounded-2xl w-fit shadow-inner ${plan.current ? "bg-green-500/10 text-green-400" : "bg-zinc-900 text-zinc-400 group-hover:text-white transition-colors"}`}>
                                        {plan.icon}
                                    </div>

                                    <h4 className="font-bold text-2xl text-white mb-2 tracking-tight">{plan.name}</h4>
                                    <p className="text-sm text-zinc-500 mb-8 leading-relaxed font-medium min-h-[40px]">{plan.desc}</p>

                                    <div className="space-y-4 mb-8">
                                        <div className="flex items-center justify-between text-sm group/item">
                                            <div className="flex items-center gap-3 text-zinc-400">
                                                <Users size={16} />
                                                <span className="font-medium">Investor Limit</span>
                                            </div>
                                            <span className="text-white font-bold">{typeof plan.limit === 'number' ? plan.limit.toLocaleString() : plan.limit}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm group/item">
                                            <div className="flex items-center gap-3 text-zinc-400">
                                                <Wallet size={16} />
                                                <span className="font-medium">Capital Managed</span>
                                            </div>
                                            <span className="text-white font-bold">{typeof plan.aum === 'number' ? `$${(plan.aum / 1000)}k` : plan.aum}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm group/item">
                                            <div className="flex items-center gap-3 text-zinc-400">
                                                <PieChart size={16} />
                                                <span className="font-medium">Platform Fee</span>
                                            </div>
                                            <span className="text-green-400 font-bold">{plan.fee}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm group/item pt-3 border-t border-white/5">
                                            <div className="flex items-center gap-3 text-zinc-400">
                                                <Server size={16} />
                                                <span className="font-medium">Speed</span>
                                            </div>
                                            <span className={`font-bold ${plan.id === "ROOKIE" ? "text-zinc-400" : "text-blue-400"}`}>
                                                {plan.id === "ROOKIE" ? "Standard Cloud" : "Turbo Cloud ⚡"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-2xl font-bold text-white mb-5 text-center tracking-tight">{plan.price}</div>
                                    {!plan.current ? (
                                        <button
                                            onClick={() => onSelectPlan(plan)}
                                            className={`w-full py-4 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl
                                                ${plan.rec
                                                    ? "bg-white text-black hover:bg-zinc-200 hover:scale-[1.02]"
                                                    : "bg-zinc-800 text-white hover:bg-zinc-700 hover:scale-[1.02]"}
                                            `}
                                        >
                                            Upgrade now
                                        </button>
                                    ) : (
                                        <div className="w-full py-4 rounded-xl bg-green-500/10 text-green-500 font-bold text-sm flex items-center justify-center gap-2 cursor-default border border-green-500/20">
                                            <CheckCircle2 size={16} /> Current Plan
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 3. VIEW COMPONENTS (Defined BEFORE Main App)
// ----------------------------------------------------------------------

interface MasterProfileViewProps {
    master: Master;
    onBack: () => void;
    requireAuth: (action: () => void) => void;
    isPreview?: boolean;
    isFav?: boolean;
    onToggleFav?: () => void;
    onStartCopy: (master: Master, amount: number, risk: number | string, sessionType: SessionType) => void;
    onStopCopy: (id: number) => void;
    isCopying?: boolean;
    maxAlloc?: number;
    isVip?: boolean;
    activeCount?: number;
    userRole?: UserRole;
    onOpenVIP?: () => void;
    goldenTickets?: number;
    isGoldenActive?: boolean;
    hasUsed7DayTrial?: boolean;
}




interface FollowerFlowProps {
    requireAuth: (action: () => void) => void;
    onViewProfile: (master: Master) => void;
    activeSessions: CopySession[];
    onStopCopy: (id: number) => void;
    onStartCopy: (master: Master, amount: number, risk: number | string, sessionType: SessionType, advanced?: { autoRenew: boolean, timeConfig: any, invertCopy?: boolean }) => void;
    favorites: number[];
    walletBalance: number;
    onStopAll: () => void;
    dailyTicketUsed: boolean;
    setDailyTicketUsed: (used: boolean) => void;
    userRole: UserRole;
    onToggleFav: (e?: React.MouseEvent, id?: number) => void;
    hasUsed7DayTrial: boolean;
    brokerAccount: any;
    masters: Master[]; // ✅ Added Prop
    masterProfile: MasterProfile; // ✅ Added Prop
    setHasUsed7DayTrial: (used: boolean) => void;
    defaultTab?: "DISCOVER" | "PORTFOLIO";
    onTabChange?: (tab: "DISCOVER" | "PORTFOLIO") => void;
}

function FollowerFlow({ requireAuth, onViewProfile, activeSessions, onStopCopy, onStartCopy, favorites, walletBalance, onStopAll, dailyTicketUsed, setDailyTicketUsed, userRole, onToggleFav, hasUsed7DayTrial, setHasUsed7DayTrial, brokerAccount, masters, masterProfile, defaultTab = "DISCOVER", onTabChange }: FollowerFlowProps) {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<"DISCOVER" | "PORTFOLIO">(defaultTab);

    // Sync internal state if prop changes (URL nav)
    // Sync internal state if prop changes (URL nav)
    useEffect(() => {
        if (defaultTab) setActiveTab(defaultTab);
    }, [defaultTab]);
    const [visibleMasterCount, setVisibleMasterCount] = useState(12); // ✅ Pagination State
    const [useWelcomeTicket, setUseWelcomeTicket] = useState(false); // ✅ New State
    const [searchTerm, setSearchTerm] = useState("");

    // ⚙️ Advanced Settings State (Lifted for Dashboard)
    const [autoRenew, setAutoRenew] = useState(true); // Default ON
    const [timeConfig, setTimeConfig] = useState<any>({ mode: "24/7", start: "09:00", end: "17:00" });
    const [invertCopy, setInvertCopy] = useState(false); // Default 24/7

    // 🔍 Advanced Filter Logic
    // 🔍 Advanced Filter Logic
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({
        minProfit: -Infinity, // ✅ Allow all (including negative) by default
        maxProfit: Infinity,
        minFee: 0,
        maxFee: Infinity,
        freeOnly: false,
        favoritesOnly: false,
        sortBy: "RECOMMENDED",
        minDrawdown: 0,
        maxDrawdown: 100,
        minTimeActive: 0
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
    const selectedMaster = useMemo(() => {
        if (!selectedMasterId) return null;
        return masters.find(m => m.id === selectedMasterId) || null;
    }, [masters, selectedMasterId]);

    // ✅ Reset Pagination on Filter/Search Change
    useEffect(() => {
        setVisibleMasterCount(12);
    }, [searchTerm, filterConfig]);



    // 🔍 ANALYTICS: Track Search Terms (Debounced)

    // 🔍 ANALYTICS: Track Search Terms (Debounced)
    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchTerm && searchTerm.length > 2) {
                // Import dynamically or use standard import if available at top
                // Assuming trackSearch will be imported or we can use fetch/server action directly
                // For now, we stub it or use the prop if we passed it (we didn't). 
                // We need to import trackSearch. Since this is client component, we import it.
                // See top imports.
                import('@/app/actions/analytics').then(mod => {
                    mod.trackSearch(searchTerm);
                }).catch(err => console.error("Analytics Error:", err));
            }
        }, 1500); // 1.5s debounce

        return () => clearTimeout(handler);
    }, [searchTerm]);

    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [aiGuardRisk, setAiGuardRisk] = useState<number | string>(100);
    const [allocation, setAllocation] = useState<number | string>(1000);
    // const [ticketTime, setTicketTime] = useState(14400); // REPLACED by derived state

    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    // const [realMasters, setRealMasters] = useState<Master[]>([]); // ❌ Removed (Lifted Up)

    // useEffect(() => {
    //    // Fetch Real Masters
    //    fetchMasters().then(setRealMasters).catch(err => console.error("Load Masters Failed:", err));
    // }, []);

    // New Ticket Modal Overlay
    const TicketPopup = useMemo(() => {
        if (!selectedTicket) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedTicket(null)}>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedTicket(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>

                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`p-4 rounded-full bg-gray-800/50 mb-2 ${selectedTicket.type === 'VIP' ? 'text-yellow-500' : selectedTicket.type === 'GOLDEN' ? 'text-yellow-400' : selectedTicket.type === 'WELCOME' ? 'text-purple-500' : 'text-blue-500'} `}>
                            {selectedTicket.type === 'VIP' ? <Crown size={32} /> : selectedTicket.type === 'GOLDEN' ? <Ticket size={32} /> : selectedTicket.type === 'WELCOME' ? <CalendarDays size={32} /> : <Zap size={32} />}
                        </div>

                        <div className="space-y-1">
                            <h3 className="text-2xl font-bold text-white tracking-tight">{selectedTicket.title}</h3>
                            <p className="text-indigo-300 font-medium text-sm">{selectedTicket.subtitle}</p>
                        </div>

                        <p className="text-gray-400 text-sm leading-relaxed">
                            {selectedTicket.description}
                        </p>

                        <div className="w-full bg-gray-950/50 rounded-xl p-4 space-y-3 text-left">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Features</p>
                            <ul className="space-y-2">
                                {selectedTicket.benefits && selectedTicket.benefits.map((benefit: string, i: number) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                                        <CheckCircle size={14} className="text-green-500" />
                                        {benefit}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button
                            onClick={() => {
                                if (selectedTicket.action) selectedTicket.action();
                                setSelectedTicket(null);
                            }}
                            className={`w-full py-3 rounded-xl font-bold text-sm transition-all transform active:scale-95 ${selectedTicket.type === 'VIP' ? 'bg-linear-to-r from-yellow-600 to-yellow-500 text-black shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30' :
                                selectedTicket.type === 'GOLDEN' ? 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-400/20' :
                                    selectedTicket.type === 'WELCOME' ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20' :
                                        'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                } `}
                        >
                            {selectedTicket.buttonText}
                        </button>
                    </div>
                </div>
            </div>
        );
    }, [selectedTicket]);



    // ⏱️ PERSISTENT TIMER LOGIC
    // ⏱️ ROBUST TIMER LOGIC
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Derive ticketTime from current time and expiry
    const ticketTime = useMemo(() => {
        const session = activeSessions.find(s => s.expiry && s.expiry > now);
        if (!session || !session.expiry) return 0;
        return Math.max(0, Math.floor((session.expiry - now) / 1000));
    }, [activeSessions, now]);

    const handleTabSwitch = (tab: "DISCOVER" | "PORTFOLIO") => {
        if (tab === "PORTFOLIO") requireAuth(() => {
            setActiveTab("PORTFOLIO");
            if (onTabChange) onTabChange("PORTFOLIO");
        });
        else {
            setActiveTab("DISCOVER");
            if (onTabChange) onTabChange("DISCOVER");
        }
    };

    // 🕒 DAILY TICKET RESET LOGIC (GMT+7 Midnight)
    const timeUntilReset = useMemo(() => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const gmt7Time = new Date(utc + (7 * 3600000));

        const nextMidnight = new Date(gmt7Time);
        nextMidnight.setHours(24, 0, 0, 0); // Next midnight

        const diff = nextMidnight.getTime() - gmt7Time.getTime();
        return Math.max(0, Math.floor(diff / 1000));
    }, [now]); // Using derived 'now' state

    // Check if daily ticket was used TODAY (GMT+7)
    useEffect(() => {
        const hasActiveDaily = activeSessions.some(s => s.type === "DAILY");
        // Simple Logic: If active daily, it's used. 
        // Improvement: Check DB history? For now, we rely on active session availability.
        // User asked: "reset to valid after mid night". 
        // If they have an active session, they can't use another (limit 1). 
        // If they STOPPED a session, can they use another? 
        // "Daily Pass" usually means 1 per day.
        // We need 'lastDailyParams' or similar. 
        // For MVP: If active session exists, it's used. If not, it's valid (unless history check added).
        // Let's stick effectively to: Active = Used. 
        // Wait, user says "When I refresh the unlock is back to work". This means they could unlock multiple times if they stopped?
        // We need to persist "used today".
        // Let's rely on 'dailyTicketUsed' state for session-based, but ideally this should be DB.
        // Given constraints, I will make the button countdown if 'dailyTicketUsed' is true OR active.
        if (hasActiveDaily) setDailyTicketUsed(true);
    }, [activeSessions]);

    // 🎟️ DYNAMIC TICKET STATUS SYNC
    const [ticketStatus, setTicketStatus] = useState({ dailyUsed: false, welcomeUsed: false, isVipActive: false });

    // 🛡️ RISK CONTROLS STATE
    const [dailyLoss, setDailyLoss] = useState("");
    const [minEquity, setMinEquity] = useState("");



    // Merge Real-Time Stats into Broker Account (Priotizing Live Data)
    // We update the 'brokerAccount' state whenever 'realTimeStats' changes.
    const [mergedBrokerAccount, setMergedBrokerAccount] = useState(brokerAccount);

    useEffect(() => {
        if (brokerAccount) {
            setMergedBrokerAccount(brokerAccount);
        }
    }, [brokerAccount]);

    // ⚡ SYNC REAL-TIME DATA TO LOCAL STATE


    useEffect(() => {
        if (session?.user?.id) {
            // 1. Get Profile for Role/Data
            getUserProfile(session.user.id).then(data => {
                if (data) {
                    // Handle any profile-specific updates if needed
                    // console.log("Profile Loaded for:", data.name);
                    // Handle any profile-specific updates if needed
                    // console.log("Profile Loaded for:", data.name);

                }
            });

            // 2. Get Ticket Statuses
            getTicketStatuses(session.user.id).then(status => {
                if (status) {
                    setHasUsed7DayTrial(status.welcomeUsed);
                    // Force Sync: If DB says used, UI must be used.
                    if (status.dailyUsed) setDailyTicketUsed(true);
                }
            });
        }
    }, [session?.user?.id, activeSessions]); // Re-check when sessions change (started/stopped)

    const handleQuickCopy = (e: React.MouseEvent, master: Master) => {
        e.stopPropagation();
        if (userRole === "MASTER") { alert("👀 Spy Mode: You are viewing as a Master."); return; }

        // CHECK: Already Copying? -> STOP
        const existingSession = activeSessions.find(s => s.master.id === master.id);
        if (existingSession) {
            onStopCopy(master.id);
            return;
        }

        // For quick copy, directly open safety setup (after auth check)
        requireAuth(() => {
            setSelectedMasterId(master.id);
            // ✅ SMART TICKET SELECTION
            const isFeeMaster = master.monthlyFee > 0;
            const canUseWelcome = !hasUsed7DayTrial;

            if (isFeeMaster) {
                // 💰 Fee Master: MUST use Welcome Ticket (Standard not allowed)
                if (canUseWelcome) {
                    setUseWelcomeTicket(true);
                } else {
                    // Trial Used + Fee Master = Paid Subscription Required. 
                    // We set to false (Standard), but SafetyGuard/Backend will catch and prompt for Payment.
                    setUseWelcomeTicket(false);
                }
            } else {
                // 🆓 Free Master: Standard First, then Welcome
                if (dailyTicketUsed && canUseWelcome) {
                    setUseWelcomeTicket(true); // Fallback to Welcome
                } else {
                    setUseWelcomeTicket(false); // Default to Standard
                }
            }
            setSafetyModalOpen(true);
        });
    };

    const confirmCopy = () => {
        if (selectedMaster) {
            // Priority: Welcome > Daily
            let sessionType = "DAILY"; // Default
            if (useWelcomeTicket) sessionType = "TRIAL_7DAY";

            // If auto-renew is on, but we are using Welcome Ticket, standard 24/7 applies?
            // Actually, we enforce 1 Master limit elsewhere.

            // ⚡ Execute Copy
            onStartCopy(selectedMaster, Number(allocation), aiGuardRisk, sessionType as SessionType, { autoRenew: autoRenew, timeConfig: timeConfig }); setSafetyModalOpen(false);
            setUseWelcomeTicket(false); // Reset
            setActiveTab("PORTFOLIO");
        }
    };


    const scroll = (direction: 'left' | 'right') => { if (scrollRef.current) { const amount = 200; scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' }); } };
    const formatTime = (s: number) => {
        if (s <= 0) return "00:00:00";
        const days = Math.floor(s / 86400);
        const hours = Math.floor((s % 86400) / 3600);
        const minutes = Math.floor((s % 3600) / 60);
        const seconds = s % 60;

        if (days > 0) return `${days}d ${hours}h ${minutes} m`;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} `;
    };

    const totalAllocated = activeSessions.reduce((sum, s) => sum + s.allocation, 0);
    // 🏦 REAL DATA: Use Broker Account if connected, otherwise fallback (or 0)
    const realEquity = mergedBrokerAccount?.equity || 0;
    const realBalance = mergedBrokerAccount?.balance || 0;
    const currency = mergedBrokerAccount?.currency || "USD";
    const currencySymbol = currency === "USD" ? "$" : `${currency} `;
    // Derived Metrics
    // 🛡️ SHADOW TRACKING: Removed per user request to allow "Maximizing Equity"
    // Followers see Real Broker Equity to utilize full purchasing power (including floating PnL/Bonus)

    const totalPnL = mergedBrokerAccount ? (realEquity - realBalance) : activeSessions.reduce((sum, s) => sum + (s.pnl || 0), 0);

    // For specific UI display:
    const totalEquity = mergedBrokerAccount ? realEquity : (walletBalance + activeSessions.reduce((sum, s) => sum + (s.allocation + (s.pnl || 0)), 0));

    // 🚀 MAXIMIZE: Allow allocating based on EQUITY (Unrealized Gains included)
    const availableBalance = mergedBrokerAccount ? Math.max(0, realEquity - totalAllocated) : walletBalance;

    const filteredMasters = useMemo(() => {
        let result = masters; // ✅ Use Real DB Data Only (Seeded Mocks)

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(m =>
                m.name.toLowerCase().includes(term) ||
                m.tags?.some(tag => tag.toLowerCase().includes(term))
            );
        }

        // 🧠 AUTO-SORT LOGIC: Fix user input (e.g., -1 to -100)
        // Check if values are non-default
        if (filterConfig.minProfit !== -Infinity || filterConfig.maxProfit !== Infinity) {
            const val1 = filterConfig.minProfit === -Infinity ? -Number.MAX_SAFE_INTEGER : filterConfig.minProfit;
            const val2 = filterConfig.maxProfit === Infinity ? Number.MAX_SAFE_INTEGER : filterConfig.maxProfit;

            const trueMin = Math.min(val1, val2);
            const trueMax = Math.max(val1, val2);

            result = result.filter(m => m.roi >= trueMin && m.roi <= trueMax);
        }

        if (!(filterConfig.minFee === 0 && filterConfig.maxFee === 0)) {
            result = result.filter(m => m.monthlyFee >= filterConfig.minFee && m.monthlyFee <= filterConfig.maxFee);
        }

        if (filterConfig.freeOnly) result = result.filter(m => m.monthlyFee === 0);

        if (filterConfig.favoritesOnly) result = result.filter(m => favorites.includes(m.id));

        // 🛡️ Drawdown Filter
        const minDD = typeof filterConfig.minDrawdown === 'number' ? filterConfig.minDrawdown : 0;
        const maxDD = typeof filterConfig.maxDrawdown === 'number' ? filterConfig.maxDrawdown : 100;

        if (minDD > 0 || maxDD < 100) {
            result = result.filter(m => (m.drawdown || 0) >= minDD && (m.drawdown || 0) <= maxDD);
        }

        // ⏱️ Time Active Filter (Months)
        if (filterConfig.minTimeActive > 0) {
            const now = Date.now();
            const oneMonthMs = 1000 * 60 * 60 * 24 * 30;
            result = result.filter(m => {
                if (!m.joined) return false;
                const activeMs = now - new Date(m.joined).getTime();
                const activeMonths = activeMs / oneMonthMs;
                return activeMonths >= filterConfig.minTimeActive;
            });
        }

        if (filterConfig.sortBy === "PROFIT") result = [...result].sort((a, b) => b.roi - a.roi);
        else if (filterConfig.sortBy === "LOW_PROFIT") result = [...result].sort((a, b) => a.roi - b.roi); // Ascending
        else if (filterConfig.sortBy === "POPULAR") result = [...result].sort((a, b) => b.followers - a.followers);
        else if (filterConfig.sortBy === "NEW") result = [...result].sort((a, b) => new Date(b.joined || 0).getTime() - new Date(a.joined || 0).getTime());

        return result;
    }, [searchTerm, filterConfig, favorites, masters]); /* Added realMasters dependency */

    // 🔄 Infinite Scroll Implementation (Placed AFTER filteredMasters)
    const loadMoreMasters = useCallback(() => {
        if (visibleMasterCount < filteredMasters.length) {
            setVisibleMasterCount(prev => Math.min(prev + 12, filteredMasters.length));
        }
    }, [visibleMasterCount, filteredMasters.length]);

    const loadingSentinelRef = useIntersectionObserver(loadMoreMasters, { rootMargin: "400px" }); // Pre-load well before bottom

    // Calculate visible tickets for dynamic grid layout
    const showWelcome = !hasUsed7DayTrial;

    const visibleTicketsCount = 1 + (showWelcome ? 1 : 0);

    let gridColsClass = "grid-cols-1";
    if (visibleTicketsCount === 2) gridColsClass = "grid-cols-2";

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex p-1.5 bg-space/50 backdrop-blur-md rounded-2xl mb-6 border border-white/5 shadow-inner">
                <button onClick={() => handleTabSwitch("DISCOVER")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "DISCOVER" ? "bg-white/10 text-white shadow shadow-purple-500/10" : "text-gray-500 hover:text-gray-300"}`}><Users size={14} /> Discover</button>
                <button onClick={() => handleTabSwitch("PORTFOLIO")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "PORTFOLIO" ? "bg-white/10 text-white shadow shadow-blue-500/10" : "text-gray-500 hover:text-gray-300"}`}><Layers size={14} /> Portfolio {activeSessions.length > 0 && <span className="bg-neon-cyan text-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{activeSessions.length}</span>}</button>
            </div>

            {activeTab === "DISCOVER" ? (
                <div className="space-y-6 pb-20">

                    {/* 🎫 Ticket Cards (Dynamic Grid) */}
                    <div className={`grid ${gridColsClass} gap-2 sm:gap-4 py-2 transition-all duration-300 ease-in-out`}>

                        {/* 1. Standard (renamed) - NEON MAGIC THEME */}
                        <div className="relative group rounded-xl">
                            {/* 🪄 Magic Neon Edge Animation */}
                            <div className="absolute -inset-[1.5px] bg-linear-to-r from-cyan-400 via-purple-500 to-emerald-400 rounded-xl opacity-75 blur-sm group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>

                            <Card
                                onClick={() => setSelectedTicket({
                                    type: 'STANDARD',
                                    title: "Standard Access",
                                    subtitle: "Unlimited Copy Free Master",
                                    description: "Copy any Free Master for unlimited time. We provide the 24/7 cloud infrastructure—no VPS required.",
                                    benefits: ["Unlimited Duration", "Access All Free Masters", "No VPS / Cloud Needed"],
                                    buttonText: dailyTicketUsed ? "ACTIVE SESSION" : "FREE ACCESS",
                                    action: dailyTicketUsed ? undefined : undefined
                                })}
                                className={`relative h-full bg-black/90 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 ${dailyTicketUsed ? "opacity-60 cursor-default grayscale" : "cursor-pointer hover:-translate-y-1"} `}
                            >
                                <CardContent className="p-2 sm:p-3 flex flex-col justify-between h-full gap-2 relative z-10">
                                    {/* Background Glow */}
                                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity duration-500">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-cyan-500 blur-2xl opacity-50 animate-pulse"></div>
                                            <Zap className="w-20 h-20 text-cyan-400 relative z-10" />
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-1 sm:gap-0 relative z-10">
                                        <div className="space-y-0.5 sm:space-y-1 min-w-0">
                                            <h4 className={`text-[10px] sm:text-xs font-bold truncate w-full text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-emerald-400`}>Standard Access</h4>
                                            <p className="text-[9px] text-gray-400 font-medium truncate w-full line-clamp-1 sm:line-clamp-none">Auto-Applied</p>
                                        </div>
                                        <div className="p-2 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                                            <Zap className={`w-3 h-3 sm:w-4 sm:h-4`} />
                                        </div>
                                    </div>

                                    {dailyTicketUsed || ticketStatus.dailyUsed ? (
                                        <button className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-[10px] font-bold cursor-not-allowed border border-gray-700 whitespace-nowrap flex items-center justify-center gap-1">
                                            <CheckCircle2 size={12} className="text-emerald-500" /> Active
                                        </button>
                                    ) : (
                                        <button className="w-full py-2 rounded-lg bg-linear-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold group-hover:bg-linear-to-r group-hover:from-cyan-500 group-hover:to-purple-600 group-hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] whitespace-nowrap relative overflow-hidden">
                                            <span className="relative z-10">FREE ACCESS</span>
                                        </button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>




                        {/* 2. Welcome (renamed from 7-Day Trial) - NEON MAGIC THEME (MATCHING STANDARD) */}
                        {showWelcome && (
                            <div className="relative group rounded-xl">
                                {/* 🪄 Magic Neon Edge Animation (Matching Standard) */}
                                <div className="absolute -inset-[1.5px] bg-linear-to-r from-cyan-400 via-purple-500 to-emerald-400 rounded-xl opacity-75 blur-sm group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>

                                <Card
                                    onClick={() => setSelectedTicket({
                                        type: 'WELCOME',
                                        title: "Welcome Gift",
                                        subtitle: "7-Day VIP Experience",
                                        description: "Experience full VIP access for 7 days. Copy Premium Masters utilizing our high-speed cloud infrastructure.",
                                        benefits: ["Access All Masters (VIP)", "No VPS / Cloud Needed", "Low Latency Execution"],
                                        buttonText: "CLAIM FREE 7 DAYS",
                                        action: undefined
                                    })}
                                    className={`relative h-full bg-black/90 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 ${hasUsed7DayTrial || ticketStatus.welcomeUsed ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer hover:-translate-y-1"} `}
                                >
                                    <CardContent className="p-2 sm:p-3 flex flex-col justify-between h-full gap-2 relative z-10">
                                        {/* Background Glow */}
                                        <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity duration-500">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-cyan-500 blur-2xl opacity-50 animate-pulse"></div>
                                                <CalendarDays className="w-20 h-20 text-cyan-400 relative z-10" />
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-1 sm:gap-0 relative z-10">
                                            <div className="space-y-0.5 sm:space-y-1 min-w-0">
                                                <h4 className={`text-[10px] sm:text-xs font-bold truncate w-full text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-emerald-400`}>Welcome Gift</h4>
                                                <p className="text-[9px] text-gray-400 font-medium truncate w-full line-clamp-1 sm:line-clamp-none">7-Day VIP Experience</p>
                                            </div>
                                            <div className="p-2 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                                                <CalendarDays className={`w-3 h-3 sm:w-4 sm:h-4`} />
                                            </div>
                                        </div>

                                        {hasUsed7DayTrial || ticketStatus.welcomeUsed ? (
                                            <button className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-[10px] font-bold cursor-not-allowed border border-gray-700 whitespace-nowrap flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} className="text-emerald-500" /> Used
                                            </button>
                                        ) : (
                                            <button className="w-full py-2 rounded-lg bg-linear-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold group-hover:bg-linear-to-r group-hover:from-cyan-500 group-hover:to-purple-600 group-hover:text-white transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] whitespace-nowrap relative overflow-hidden">
                                                <span className="relative z-10">CLAIM FREE 7 DAYS</span>
                                            </button>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* 3. VIP (Renamed Subtitle) */}


                    </div>

                    <div className="sticky top-20 bg-void/80 backdrop-blur-xl py-4 z-50 space-y-3 -mx-4 px-4 border-b border-white/5 shadow-md">
                        <div className="relative group/search">
                            <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within/search:text-neon-cyan transition-colors" size={16} />
                            <input type="text" placeholder="Search Masters..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-space border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/50 text-white transition-all placeholder:text-gray-600" />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                            <button onClick={() => setShowFilterModal(true)} className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${showFilterModal || filterConfig.sortBy !== "RECOMMENDED" ? "bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.2)]" : "bg-space text-gray-400 border-white/10 hover:border-white/30"} `}>
                                <SlidersHorizontal size={12} /> {filterConfig.sortBy === "RECOMMENDED" ? "Filters" : filterConfig.sortBy}
                            </button>

                            {/* Quick Filter: New */}
                            <button
                                onClick={() => setFilterConfig(prev => ({ ...prev, sortBy: prev.sortBy === "NEW" ? "RECOMMENDED" : "NEW" }))}
                                className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${filterConfig.sortBy === "NEW" ? "bg-purple-500/20 text-purple-400 border-purple-500/50" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"} `}
                            >
                                {filterConfig.sortBy === "NEW" ? "Newest First" : "New"}
                            </button>

                            {/* Quick Filter: Free */}
                            <button onClick={() => setFilterConfig(prev => ({ ...prev, freeOnly: !prev.freeOnly }))} className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${filterConfig.freeOnly ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-gray-900 text-gray-400 border-gray-700"} `}>
                                {filterConfig.freeOnly ? "Free Only ✓" : "Free"}
                            </button>

                            {/* Quick Filter: Favorites (Separated Logic for simple toggle) */}
                            <button onClick={() => setFilterConfig(prev => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))} className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${filterConfig.favoritesOnly ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"} `}>
                                {filterConfig.favoritesOnly ? "Favorites Only ❤️" : "Favorites"}
                            </button>

                            {/* Sort Toggle: Profit */}
                            <button
                                onClick={() => setFilterConfig(prev => ({
                                    ...prev,
                                    sortBy: prev.sortBy === "PROFIT" ? "LOW_PROFIT" : "PROFIT"
                                }))}
                                className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all flex items-center gap-1 ${filterConfig.sortBy === "PROFIT" || filterConfig.sortBy === "LOW_PROFIT" ? "bg-blue-500/20 text-blue-400 border-blue-500/50" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"} `}
                            >
                                <ArrowUpDown size={12} />
                                {filterConfig.sortBy === "LOW_PROFIT" ? "Lowest Profit" : "Sort Profit"}
                            </button>
                        </div>
                    </div>

                    {/* Rendering Filter Modal */}
                    {showFilterModal && (
                        <FilterSortModal
                            config={filterConfig}
                            setConfig={setFilterConfig}
                            onClose={() => setShowFilterModal(false)}
                            resultsCount={filteredMasters.length}
                            onReset={() => setFilterConfig({
                                minProfit: -Infinity,
                                maxProfit: Infinity,
                                minFee: 0,
                                maxFee: Infinity,
                                freeOnly: false,
                                favoritesOnly: false,
                                sortBy: "RECOMMENDED",
                                minDrawdown: 0,
                                maxDrawdown: 100,
                                minTimeActive: 0
                            })}
                        />
                    )}

                    {!searchTerm && filterConfig.sortBy === "RECOMMENDED" && !filterConfig.freeOnly && (
                        <div className="space-y-2 relative group/scroll">
                            <div className="flex justify-between items-center px-1"><h3 className="font-bold text-sm text-gray-200">Recommended</h3><div className="flex gap-2"><button onClick={() => scroll('left')} className="hidden md:flex w-6 h-6 bg-gray-800 rounded-full items-center justify-center hover:bg-white hover:text-black transition-colors"><ChevronLeft size={14} /></button><button onClick={() => scroll('right')} className="hidden md:flex w-6 h-6 bg-gray-800 rounded-full items-center justify-center hover:bg-white hover:text-black transition-colors"><ChevronRight size={14} /></button></div></div>
                            <div ref={scrollRef} className="flex gap-4 overflow-x-auto py-6 snap-x no-scrollbar scroll-smooth px-2">
                                {filteredMasters.slice(0, 5).map((master) => {
                                    const isProfit = master.roi >= 0;
                                    const startYear = master.joined ? new Date(master.joined).getFullYear() : 2024;
                                    const joinedDate = master.joined ? new Date(master.joined).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "2024";

                                    return (
                                        <div key={master.id} onClick={() => onViewProfile(master)} className="snap-center min-w-[240px] w-[240px] h-[360px] bg-[#0F1115] rounded-2xl flex flex-col justify-between relative overflow-hidden group border border-white/5 hover:border-gray-600 transition-all cursor-pointer hover:-translate-y-1 shadow-lg hover:shadow-2xl ">

                                            {/* ROW 1: PROFILE & TAGS (Top) */}
                                            <div className="z-20 relative flex flex-col items-center text-center p-1">
                                                <div className="w-full flex justify-between items-start absolute top-4 px-4">
                                                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border-0 font-bold ${(master.risk || 1) <= 1 ? "bg-green-500/10 text-green-500" :
                                                        (master.risk || 1) === 2 ? "bg-blue-500/10 text-blue-500" :
                                                            (master.risk || 1) === 3 ? "bg-yellow-500/10 text-yellow-500" :
                                                                (master.risk || 1) === 4 ? "bg-orange-500/10 text-orange-500" :
                                                                    "bg-red-500/10 text-red-500"
                                                        }`}>
                                                        RISK {master.risk || 1}
                                                    </Badge>
                                                    <div onClick={(e) => onToggleFav(e, master.id)} className="cursor-pointer hover:scale-110 transition-transform">
                                                        {favorites.includes(master.id) ? <Heart size={14} className="text-red-500 fill-red-500" /> : <Heart size={14} className="text-gray-600 hover:text-white" />}
                                                    </div>
                                                </div>

                                                <div className="mt-4 mb-2 relative">
                                                    <img src={master.avatar} alt={master.name} className="w-14 h-14 rounded-full border-2 border-[#1C1F26] shadow-sm transform group-hover:scale-105 transition-transform" />
                                                </div>

                                                <h4 className="font-bold text-base text-gray-200 truncate w-full px-2 mb-1">{master.name}</h4>

                                                {/* Tags & Copiers */}
                                                <div className="flex flex-wrap justify-center gap-1 mb-1 px-1">
                                                    {master.tags?.map((t, i) => {
                                                        const isMatch = searchTerm && t.toLowerCase().includes(searchTerm.toLowerCase());
                                                        return (
                                                            <span key={i} className={`text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer max-w-[80px] truncate inline-block align-middle ${isMatch ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/50"}`} title={t}>{t}</span>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                    <Users size={12} /> {master.followers} Copiers
                                                </div>
                                            </div>

                                            {/* ROW 2: EQUITY CURVE (Middle - Centered) */}
                                            <div className="flex-1 w-full flex items-center justify-center my-2 relative z-10 group-hover:scale-110 transition-transform duration-500 px-4">
                                                <MasterEquityChart data={master.sparklineData || []} height={64} color={isProfit ? "#10B981" : "#EF4444"} />
                                            </div>

                                            {/* ROW 3: STATS & BUTTON (Bottom) */}
                                            <div className="z-20 relative bg-[#0F1115]/50 backdrop-blur-sm px-4 pt-4 pb-6 border-t border-white/5">
                                                <div className="text-center mb-2">
                                                    <div className={`text-2xl font-black tracking-tight ${isProfit ? "text-green-400" : "text-red-400"}`}>
                                                        {isProfit ? "+" : ""}{master.roi}%
                                                    </div>
                                                </div>
                                                <button onClick={(e) => handleQuickCopy(e, master)} disabled={userRole === "MASTER"} className={`w-full text-xs font-bold py-3 rounded-lg transition-all shadow-lg ${activeSessions.some((s) => s.master.id === master.id) ? "bg-red-500 text-white shadow-red-900/50" : userRole === "MASTER" ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200 hover:shadow-white/20"} `}>
                                                    {userRole === "MASTER" ? "View Only" : activeSessions.some((s) => s.master.id === master.id) ? "Stop Copying" : "Copy"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 pt-4 border-t border-gray-800">
                        <h3 className="font-bold text-sm text-gray-400 px-1">All Masters ({filteredMasters.length})</h3>
                        {filteredMasters.length === 0 ? <p className="text-center text-gray-500 text-xs py-10">No masters found.</p> :
                            <div className="space-y-3">
                                {filteredMasters.slice(0, visibleMasterCount).map((master) => {
                                    const isProfit = master.roi >= 0;
                                    const startYear = master.joined ? new Date(master.joined).getFullYear() : 2024;
                                    const joinedDate = master.joined ? new Date(master.joined).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "2024";

                                    return (
                                        <div key={master.id} onClick={() => onViewProfile(master)} className="bg-[#0F1115] rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-6 items-center border border-white/5 hover:border-gray-600 transition-all cursor-pointer hover:-translate-y-1 shadow-lg group">

                                            {/* COL 1: PROFILE INFO & TAGS */}
                                            <div className="flex items-center gap-4">
                                                <div className="relative shrink-0">
                                                    <img src={master.avatar} alt={master.name} className="w-16 h-16 rounded-xl border-2 border-[#1C1F26] shadow-sm group-hover:border-neon-purple transition-colors" />
                                                    <div className="absolute -top-2 -right-2 bg-[#0F1115] rounded-full p-1" onClick={(e) => onToggleFav(e, master.id)}>
                                                        {favorites.includes(master.id) ? <Heart size={14} className="text-red-500 fill-red-500" /> : <Heart size={14} className="text-gray-600 hover:text-white" />}
                                                    </div>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-bold text-base text-gray-200 truncate">{master.name}</h4>
                                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 font-bold ${(master.risk || 1) <= 1 ? "bg-green-500/10 text-green-500" :
                                                            (master.risk || 1) === 2 ? "bg-blue-500/10 text-blue-500" :
                                                                (master.risk || 1) === 3 ? "bg-yellow-500/10 text-yellow-500" :
                                                                    (master.risk || 1) === 4 ? "bg-orange-500/10 text-orange-500" :
                                                                        "bg-red-500/10 text-red-500"
                                                            }`}>
                                                            RISK {master.risk || 1}
                                                        </Badge>
                                                    </div>

                                                    {/* TAGS (Important) */}
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {master.tags?.map((t, i) => {
                                                            const isMatch = searchTerm && t.toLowerCase().includes(searchTerm.toLowerCase());
                                                            return (
                                                                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer max-w-[80px] truncate inline-block align-middle ${isMatch ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/50" : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/50"}`} title={t}>{t}</span>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                        <span className="flex items-center gap-1"><Users size={10} /> {master.followers}</span>
                                                        <span className="text-gray-700">|</span>
                                                        <span>Sync {joinedDate}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* COL 2: EQUITY CURVE (MIDDLE) */}
                                            <div className="h-16 w-full relative opacity-50 group-hover:opacity-80 transition-opacity block">
                                                <MasterEquityChart data={master.sparklineData || []} height={64} color={isProfit ? "#10B981" : "#EF4444"} />
                                            </div>

                                            {/* COL 3: STATS & ACTION */}
                                            <div className="flex items-center justify-between md:justify-end gap-6">
                                                <div className="text-right">
                                                    <div className={`text-2xl font-black tracking-tight ${isProfit ? "text-green-400" : "text-red-400"}`}>
                                                        {isProfit ? "+" : ""}{master.roi}%
                                                    </div>
                                                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Return</div>
                                                </div>

                                                <button onClick={(e) => handleQuickCopy(e, master)} disabled={userRole === "MASTER"} className={`w-32 text-xs font-bold py-3 rounded-lg transition-all shadow-lg ${activeSessions.some((s) => s.master.id === master.id) ? "bg-red-500 text-white shadow-red-900/50" : userRole === "MASTER" ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200 hover:shadow-white/20"} `}>
                                                    {userRole === "MASTER" ? "View" : activeSessions.some((s) => s.master.id === master.id) ? "Stop" : "Copy"}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}

                                {visibleMasterCount < filteredMasters.length ? (
                                    <div ref={loadingSentinelRef} className="flex justify-center py-8">
                                        <div className="flex items-center gap-2 text-gray-500 text-xs font-bold animate-pulse">
                                            <div className="w-2 h-2 bg-neon-purple rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            <div className="w-2 h-2 bg-neon-purple rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                            <div className="w-2 h-2 bg-neon-purple rounded-full animate-bounce"></div>
                                            <span className="ml-2 uppercase tracking-wider">Loading Masters...</span>
                                        </div>
                                    </div>
                                ) : (
                                    filteredMasters.length > 0 && (
                                        <div className="text-center py-8 text-gray-600 text-xs font-bold uppercase tracking-widest opacity-50">
                                            All Masters Loaded
                                        </div>
                                    )
                                )}
                            </div>
                        }
                    </div>
                </div>
            ) : (
                // 📊 PORTFOLIO VIEW
                <div className="space-y-6 animate-in slide-in-from-right">


                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase mb-1">Active Masters</p><div className="flex items-center gap-2"><Users size={16} className="text-blue-400" /><span className="font-bold text-sm text-white">{activeSessions.length} / 1</span></div></div>
                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase mb-1">Time Remaining</p><div className="flex items-center gap-2"><Clock size={16} className="text-green-400" /><span className="font-bold text-sm text-white">{formatTime(ticketTime)}</span></div></div>
                    </div>

                    <div className="space-y-4 pb-24">
                        <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide">Active Portfolios</h3>
                        {activeSessions.length === 0 ? (<div className="text-center py-10 text-gray-500 space-y-2 border border-dashed border-gray-800 rounded-2xl"><Briefcase className="mx-auto opacity-50" size={40} /><p className="text-xs">No active copies.</p></div>) : (
                            activeSessions.map((session) => (
                                <ActiveSessionWidget
                                    key={session.id}
                                    master={session.master}
                                    time={ticketTime}
                                    risk={session.risk}
                                    allocation={session.allocation}
                                    onStop={() => onStopCopy(session.master.id)}
                                    session={session}
                                    onClick={() => onViewProfile(session.master)} // ✅ Navigation
                                    currencySymbol={currencySymbol}
                                />

                            ))
                        )}

                        {/* Removed Open Positions Table from here */}
                    </div>

                    {activeSessions.length > 0 && (
                        <div className="fixed bottom-0 left-0 w-full bg-gray-950/90 backdrop-blur-xl border-t border-gray-800 p-4 z-30">
                            <div className="max-w-md mx-auto">
                                <button onClick={onStopAll} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-900/40 flex items-center justify-center gap-2 animate-pulse"><AlertOctagon size={20} /> EMERGENCY STOP ALL</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {safetyModalOpen && selectedMaster && (
                <SafetyGuardModal
                    initialRisk={20} // Legacy Risk Score (Fixed)
                    initialAllocation={allocation}
                    initialProRata={Number(aiGuardRisk) || 100} // ✅ Persist Pro-Rata Preference
                    maxAlloc={availableBalance} // ✅ Fixed: Use local availableBalance
                    initialAutoRenew={true}
                    initialTimeConfig={timeConfig} // Default
                    initialInvert={invertCopy} // ✅ Persist Invert
                    initialUseWelcome={useWelcomeTicket} // ✅ Pass Auto-Selection
                    showWelcomeOption={!hasUsed7DayTrial}
                    onClose={() => setSafetyModalOpen(false)}
                    onConfirm={(data) => {
                        // 1. Update State (for UI consistency next open)
                        setAiGuardRisk(data.proRataPercent); // ✅ Save Pro-Rata 
                        setAllocation(data.allocation);
                        setAutoRenew(data.autoRenew);
                        setTimeConfig(data.timeConfig);
                        setInvertCopy(data.invertCopy); // ✅ Save Invert Pref
                        if (data.useWelcome) setUseWelcomeTicket(true);


                        // 2. Logic from confirmCopy() but using Data
                        let sessionType = "DAILY";
                        if (data.useWelcome) sessionType = "TRIAL_7DAY";

                        if (selectedMaster) {
                            // ✅ PASS PRO-RATA PERCENT AS RISK FACTOR
                            onStartCopy(selectedMaster, Number(data.allocation), data.proRataPercent, sessionType as SessionType, { autoRenew: data.autoRenew, timeConfig: data.timeConfig, invertCopy: data.invertCopy });
                        }

                        setSafetyModalOpen(false);
                        setUseWelcomeTicket(false);
                        setActiveTab("PORTFOLIO");
                    }}
                />
            )}
            {TicketPopup}
        </div>
    );
}

// ----------------------------------------------------------------------
// 🟣 MASTER FLOW (V2.0 Logic - Capacity & Tiers)
// ----------------------------------------------------------------------
interface MasterFlowProps {
    onOpenSettings: () => void;
    onViewFollower: (follower: Follower) => void;
    userRole: UserRole;
    profile: MasterProfile;
    setProfile: (p: MasterProfile) => void;
    onBecomeMaster?: () => void;
    onOpenWallet?: () => void;
    followers?: Follower[];
    brokerAccount: BrokerAccount | null; // ✅ Added Prop
    onViewProfile: (master: Master) => void; // ✅ Added Prop for Navigation
}

function MasterFlow({ onOpenSettings, onViewFollower, userRole, profile, setProfile, onOpenWallet, onBecomeMaster, followers = [], brokerAccount, onViewProfile }: MasterFlowProps) {
    const [showUpgradeMaster, setShowUpgradeMaster] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    // const [viewMyProfile, setViewMyProfile] = useState(false); // 🗑️ Removed Mock Preview

    // Calculate Capacity
    const followerPercent = (profile.followersCount / profile.followersLimit) * 100;
    const aumPercent = (profile.aum / profile.aumLimit) * 100;
    const isCritical = followerPercent >= 90 || aumPercent >= 90;

    const handleSelectPlan = (plan: any) => {
        setSelectedPlan(plan);
        setShowUpgradeMaster(false);
        setPaymentModalOpen(true);
    }

    // 🔄 Self-Fix Stats on Load
    useEffect(() => {
        if (userRole === "MASTER" && profile.userId) {
            refreshMasterStats(profile.userId).then((res: any) => {
                if (res.success && res.aum !== undefined) {
                    // Update Local State if different
                    if (res.aum !== profile.aum || res.followersCount !== profile.followersCount) {
                        setProfile({
                            ...profile,
                            aum: res.aum,
                            followersCount: res.followersCount || 0
                        });
                    }
                }
            });
        }
    }, [userRole, profile.userId]);

    const handleUpgradeSuccess = async () => {
        setPaymentModalOpen(false);
        if (selectedPlan) {
            // ⚡ Real Backend Upgrade
            try {
                const result = await updateMasterPlan(profile.userId || "", selectedPlan.id);
                if (result.success) {
                    setProfile({
                        ...profile,
                        tier: selectedPlan.id,
                        followersLimit: selectedPlan.newLimit,
                        aumLimit: selectedPlan.newAum
                    });
                    toast.success("Upgrade Successful! 🎉", { description: `You are now a ${selectedPlan.name}. Limits increased!` });
                } else {
                    toast.error("Upgrade Failed", { description: result.error });
                }
            } catch (e) {
                toast.error("Upgrade Error", { description: "Connection failed" });
            }
        }
    }

    // Construct a Master object from the profile to preview
    // ✅ Unified "View Me" Logic
    const handleViewMyProfile = () => {
        const myProfileAsMaster: Master = {
            id: 9999, // Placeholder ID for "Me"
            userId: profile.userId, // ✅ Fix: Pass User ID for Save/Edit actions
            name: profile.name,
            type: "HUMAN",
            winRate: 0,
            roi: 0,
            pnlText: "$0",
            followers: profile.followersCount,
            balance: 0,
            risk: profile.riskScore || 1, // 🧠 Real AI Risk Score
            drawdown: 0,
            profitFactor: 0,
            avatar: profile.avatar,
            desc: profile.desc,
            tags: profile.tags,
            joined: "2026",
            currentOrders: [],
            monthlyFee: profile.monthlyFee,
            isPremium: profile.monthlyFee > 0,
            isPublic: profile.isPublic ?? true,
            aum: profile.aum,
            minDeposit: profile.minDeposit || 10,
            // ✅ Only show leverage if ACTIVE (Equity > 0)
            // ✅ Only show leverage if TRULY CONNECTED & ACTIVE
            // leverage: (brokerAccount?.status === "CONNECTED" && brokerAccount?.equity && brokerAccount.equity > 0) ? (brokerAccount.leverage || 0) : 0,
            leverage: (brokerAccount?.status === "CONNECTED") ? (brokerAccount.leverage) : 0,
            riskReward: 0,
            tier: profile.tier
        };
        onViewProfile(myProfileAsMaster); // ✅ Use Prop
    };

    return (
        <div className="animate-in slide-in-from-right-4 space-y-6 pb-20">

            {/* 🚨 Capacity Alert (Only for Master) */}
            {userRole === "MASTER" && isCritical && (
                <div onClick={() => setShowUpgradeMaster(true)} className="bg-linear-to-r from-orange-500 to-red-600 p-4 rounded-2xl shadow-lg shadow-orange-900/20 cursor-pointer relative overflow-hidden group">
                    <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4"><TrendingUp size={100} color="white" /></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <h3 className="text-white font-bold text-base flex items-center gap-2"><AlertTriangle size={18} className="animate-bounce" /> Shop Limit Reached!</h3>
                            <p className="text-orange-100 text-xs mt-1">Upgrade to accept more followers & income.</p>
                        </div>
                        <button className="bg-white text-orange-600 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-sm group-hover:scale-105 transition-transform">Upgrade</button>
                    </div>
                </div>
            )}

            {/* 1. Live Broadcasting Banner */}
            {userRole === "MASTER" && (
                <div className="sticky top-20 z-10 -mx-4 px-4 pb-2 bg-gray-950/95 backdrop-blur-sm">
                    <div className="bg-linear-to-r from-gray-900 to-gray-800 border border-gray-800 p-3 rounded-2xl flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </div>
                            <div>
                                <p className="font-bold text-xs text-white flex items-center gap-2">
                                    Signal Active
                                    <span className="px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20">LIVE</span>
                                </p>

                            </div>
                        </div>
                        <div className="bg-gray-800 p-2 rounded-full cursor-pointer hover:bg-gray-700 transition-colors">
                            <Radio size={16} className="text-gray-400" />
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Card */}
            <div
                onClick={handleViewMyProfile}
                className="bg-gray-900 rounded-2xl p-5 border border-gray-800 relative overflow-hidden cursor-pointer hover:border-gray-600 transition-colors group"
            >
                <div className={`absolute top - 0 left - 0 w - full h - 1 bg - gradient - to - r ${userRole === "MASTER" ? "from-purple-500 to-indigo-600" : "from-gray-700 to-gray-600"} `}></div>
                <div className="flex items-center gap-3 mb-6 cursor-pointer">
                    <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center font-bold text-xl border-4 border-gray-900 shadow-xl relative z-10">MK</div>
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2 group-hover:text-purple-300 transition-colors">
                            {profile.name}
                        </h2>
                        {userRole === "MASTER" && (
                            <span className="bg-purple-900/30 text-purple-400 text-[9px] font-bold px-2 py-0.5 rounded border border-purple-500/30">TIER: {profile.tier}</span>
                        )}
                    </div>
                    <div className="ml-auto"><Eye size={16} className="text-gray-600 group-hover:text-white" /></div>
                </div>

                {/* 📊 Capacity Dashboard */}
                {userRole === "MASTER" && (
                    <div
                        className="relative group/capacity space-y-4 bg-black/40 p-3 rounded-xl border border-gray-800 cursor-pointer hover:border-purple-500/50 hover:bg-black/60 transition-all overflow-hidden"
                        onClick={(e) => { e.stopPropagation(); setShowUpgradeMaster(true); }}
                    >
                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover/capacity:opacity-100 transition-opacity">
                            <span className="text-[10px] font-bold text-purple-400 flex items-center gap-1">
                                Expand Business <ChevronRight size={10} />
                            </span>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                <span>Total Investor</span>
                                <span className={followerPercent >= 90 ? "text-red-400" : "text-white"}>{profile.followersCount} / {profile.followersLimit}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h - full rounded - full transition - all duration - 1000 ${followerPercent >= 90 ? "bg-red-500" : "bg-blue-500"} `} style={{ width: `${followerPercent}% ` }}></div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                <span>Investor Allocation</span>
                                <span className={aumPercent >= 90 ? "text-red-400" : "text-white"}>${profile.aum.toLocaleString()} / ${profile.aumLimit.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h - full rounded - full transition - all duration - 1000 ${aumPercent >= 90 ? "bg-red-500" : "bg-green-500"} `} style={{ width: `${aumPercent}% ` }}></div>
                            </div>
                            {/* Hover Overlay Hint */}
                            <div className="hidden group-hover/capacity:flex absolute inset-0 bg-purple-900/10 backdrop-blur-[1px] items-center justify-center rounded-xl">
                                <div className="bg-gray-950/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-xl border border-purple-500/30 flex items-center gap-2">
                                    <TrendingUp size={14} className="text-purple-400" />
                                    Expand Business
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-4">
                    {/* 👥 Followers Stat */}
                    <div className="glass-panel p-4 rounded-xl flex flex-col items-center justify-center space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            <Users size={12} className="text-gray-500" />
                            Followers
                        </div>
                        <p className="text-2xl font-bold font-mono text-white">{userRole === "MASTER" ? profile.followersCount : "-"}</p>
                    </div>

                    {/* 💰 Wallet / GP Earned Stat */}
                    <div
                        onClick={(e) => { e.stopPropagation(); if (userRole === "MASTER" && onOpenWallet) onOpenWallet(); }}
                        className={`relative overflow-hidden p-4 rounded-xl flex flex-col items-center justify-center space-y-1 transition-all duration-300 group/wallet ${userRole === "MASTER"
                            ? "cursor-pointer bg-linear-to-br from-gray-900 via-gray-900 to-purple-900/20 border border-purple-500/30 hover:border-green-500/50 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]"
                            : "bg-black/30 border border-white/5 opacity-50"
                            }`}
                    >
                        {userRole === "MASTER" && (
                            <div className="absolute top-0 right-0 p-1.5 opacity-0 group-hover/wallet:opacity-100 transition-opacity">
                                <ArrowUpRight size={10} className="text-green-400" />
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider group-hover/wallet:text-green-400 transition-colors">
                            <Wallet size={12} className={userRole === "MASTER" ? "group-hover/wallet:rotate-12 transition-transform text-gray-500 group-hover/wallet:text-green-500" : "text-gray-600"} />
                            My Wallet
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <p className={`text-2xl font-bold font-mono ${userRole === "MASTER" ? "text-green-400 group-hover/wallet:text-green-300 group-hover/wallet:scale-105 transition-all" : "text-gray-600"}`}>
                                {userRole === "MASTER" ? "$0.00" : "$0.00"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div onClick={onOpenSettings} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors group">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-900/20 p-2.5 rounded-lg border border-purple-500/20"><Edit3 className="text-purple-400" size={20} /></div>
                    <div><p className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">Edit Public Profile</p><p className="text-[10px] text-gray-500">Manage Subscription, Bio, Tags & Avatar</p></div>
                </div>
                <ChevronRight className="text-gray-600 group-hover:text-white" size={18} />
            </div>

            {/* 2. Recent Followers */}
            {userRole === "MASTER" ? (
                <div className="space-y-3">

                </div>
            ) : (
                <div className="relative overflow-hidden rounded-2xl p-1 bg-linear-to-br from-gray-800 to-gray-900 border border-gray-800">
                    <div className="absolute inset-0 bg-grid-white/[0.02] bg-size-[16px_16px]"></div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full point-events-none"></div>

                    <div className="relative bg-gray-950/80 backdrop-blur-xl rounded-xl p-8 text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-linear-to-tr from-purple-600 to-blue-600 rounded-full p-[2px] shadow-lg shadow-purple-900/40 animate-pulse">
                            <div className="w-full h-full bg-gray-950 rounded-full flex items-center justify-center">
                                <Briefcase className="text-white" size={28} />
                            </div>
                        </div>



                        <button
                            onClick={onBecomeMaster}
                            className="w-full bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group"
                        >
                            <span>Activate Master Mode</span>
                            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>

                        <div>

                            <p className="text-xs text-gray-400 max-w-[200px] mx-auto">publishing your signals and earning income.</p>
                        </div>
                    </div>
                </div>
            )}

            {showUpgradeMaster && <MasterPlanModal onClose={() => setShowUpgradeMaster(false)} currentTier={profile.tier} onSelectPlan={handleSelectPlan} />}
            {paymentModalOpen && <UniversalPaymentModal onClose={() => setPaymentModalOpen(false)} onSuccess={handleUpgradeSuccess} planDetails={selectedPlan} />}
        </div>
    );
}

// ----------------------------------------------------------------------
// 👤 FOLLOWER DETAIL VIEW
// ----------------------------------------------------------------------
interface FollowerDetailProps {
    follower: Follower;
    onBack: () => void;
}

function FollowerDetailView({ follower, onBack }: FollowerDetailProps) {
    return (
        <div className="fixed inset-0 bg-gray-950 z-50 overflow-y-auto pb-24 animate-in slide-in-from-right duration-300">
            <div className="sticky top-0 bg-gray-950/80 backdrop-blur z-40 p-4 flex items-center gap-4 border-b border-gray-800">
                <button onClick={onBack} className="bg-gray-800 p-2 rounded-full text-white hover:bg-gray-700"><ChevronLeft size={20} /></button>
                <span className="font-bold text-sm">Follower Detail</span>
            </div>
            <div className="p-6 text-center space-y-6">
                <div className="w-24 h-24 mx-auto rounded-full border-4 border-gray-800 overflow-hidden"><img src={follower.avatar} alt={follower.name} className="w-full h-full" /></div>
                <div><h2 className="text-2xl font-bold text-white">{follower.name}</h2><p className="text-gray-500 text-sm">Subscribed since {follower.joined}</p></div>
                <div className="grid grid-cols-2 gap-3"><div className="bg-gray-900 p-4 rounded-2xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase">Equity</p><p className="text-xl font-bold text-white">${follower.equity}</p></div><div className="bg-gray-900 p-4 rounded-2xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase">Profit Made</p><p className={`text - xl font - bold ${follower.pnl.includes('+') ? 'text-green-400' : 'text-red-400'} `}>{follower.pnl}</p></div></div>
                <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl text-left"><p className="text-xs text-gray-500 text-center">View-only mode. Privacy protected.</p></div>
            </div>
        </div>
    )
}

// ----------------------------------------------------------------------
// 📦 MAIN APP COMPONENT (Moved to BOTTOM)
// ----------------------------------------------------------------------
// --- TYPES ---
import { AnalyticStats, EquityPoint, MonthlyResult, SymbolDistribution } from "@/app/actions/analytics";

interface SocialTradingAppProps {
    initialSlug?: string;
    initialBrokerAccount?: BrokerAccount | null; // ✅ SSR Hydration
    initialMaster?: Master | null; // ✅ SSR Hydration
    initialMasters?: Master[]; // ✅ SSR Hydration (List)
    initialAnalytics?: {
        stats: AnalyticStats;
        equityCurve: EquityPoint[];
        monthlyResults: MonthlyResult[];
        symbolDist: SymbolDistribution[];
        history: any[];
    } | null;
}

export function SocialTradingApp({ initialSlug, initialBrokerAccount, initialMaster, initialMasters, initialAnalytics }: SocialTradingAppProps) {
    const { data: session, status } = useSession();

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isClient, setIsClient] = useState(false);

    // 🌍 URL STATE PERSISTENCE
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const createQueryString = useCallback(
        (pairs: { name: string; value: string | null }[]) => {
            const params = new URLSearchParams(searchParams.toString());
            pairs.forEach(({ name, value }) => {
                if (value === null) params.delete(name);
                else params.set(name, value);
            });
            return params.toString();
        },
        [searchParams]
    );

    // 🔄 MAPPING UTILS (Internal <-> URL)
    const toUrlView = (role: UserRole) => role === "MASTER" ? "master" : "follower";
    const fromUrlView = (val: string | null): UserRole => (val === "master" ? "MASTER" : "FOLLOWER");

    const toUrlTab = (tab: "DISCOVER" | "PORTFOLIO") => tab === "PORTFOLIO" ? "portfolio" : "market";
    const fromUrlTab = (val: string | null): "DISCOVER" | "PORTFOLIO" => (val === "portfolio" ? "PORTFOLIO" : "DISCOVER");

    // Initialize View Mode directly from URL or Default
    const initialView = fromUrlView(searchParams.get("view"));
    const [viewMode, setViewModeInternal] = useState<UserRole>(initialView);

    // ✅ FIX: Sync View Mode with URL (Back Button Support)
    useEffect(() => {
        const modeFromUrl = fromUrlView(searchParams.get("view"));
        if (modeFromUrl !== viewMode) {
            setViewModeInternal(modeFromUrl);
        }
    }, [searchParams.get("view")]); // Only dependent on the 'view' param

    // Wrapper to update URL when view changes
    const setViewMode = (mode: UserRole) => {
        setViewModeInternal(mode);
        // Persist preference
        if (typeof window !== "undefined") localStorage.setItem("last_view_mode", mode);
        // Only push if we are NOT on a slug page, OR update logic to handle slug preservation if needed.
        // For now, simple param update.
        router.push(pathname + "?" + createQueryString([{ name: "view", value: toUrlView(mode) }]));
    };

    // Initialize Tab from URL
    const initialTab = fromUrlTab(searchParams.get("tab"));

    // Initialize Profile ID from URL
    const initialProfileIdStr = searchParams.get("profile");
    const initialProfileId = initialProfileIdStr ? Number(initialProfileIdStr) : null;

    // ✅ Initialize Status with Server Data (No Flicker)
    const [accountStatus, setAccountStatus] = useState<AccountStatus>(
        initialBrokerAccount ? (initialBrokerAccount.status as AccountStatus) : "DISCONNECTED"
    );

    useEffect(() => { setIsClient(true); }, []);
    const [userRole, setUserRole] = useState<UserRole>("FOLLOWER");
    const [walletBalance, setWalletBalance] = useState(INITIAL_BALANCE);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [activeSessions, setActiveSessions] = useState<CopySession[]>([]);

    // ✅ Initialize Broker Account with Server Data
    const [brokerAccount, setBrokerAccount] = useState<BrokerAccount | null>(initialBrokerAccount || null);

    // 🎟️ TICKET STATE
    // Changed to Derived State: Active if ANY Standard (DAILY) session is running.
    // User Requirement: Unlimited Resets, but only 1 concurrent copy.
    const dailyTicketUsed = useMemo(() => activeSessions.some(s => s.type === 'DAILY'), [activeSessions]);
    const setDailyTicketUsed = () => { }; // No-op, state is now derived.
    const [hasUsed7DayTrial, setHasUsed7DayTrial] = useState(false);
    const [favorites, setFavorites] = useState<number[]>([]);

    // ⚡ LOADING STATES (Global)
    const [mastersLoaded, setMastersLoaded] = useState(false);
    const [profileNotFound, setProfileNotFound] = useState(false);

    // 🛡️ RISK STATE
    const [dailyLoss, setDailyLoss] = useState<string | number>("");
    const [minEquity, setMinEquity] = useState<string | number>("");
    const [aiGuardRisk, setAiGuardRisk] = useState<string | number>("Balanced"); // Default risk
    const [allocation, setAllocation] = useState<string | number>(1000); // Default alloc
    const [useWelcomeTicket, setUseWelcomeTicket] = useState(false);
    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [selectedMaster, setSelectedMaster] = useState<Master | null>(null);

    const [masterProfile, setMasterProfile] = useState<MasterProfile>(() => {
        // 🚀 HYDRATION: If we are on Home (no slug) and have initialMaster, it's the Logged-In Master Profile.
        if (!initialSlug && initialMaster) {
            return {
                userId: initialMaster.userId, // Map Master -> MasterProfile
                name: initialMaster.name,
                desc: initialMaster.desc || "",
                tags: initialMaster.tags || [],
                avatar: initialMaster.avatar || "",
                tier: initialMaster.tier || "ROOKIE",
                followersCount: initialMaster.followers,
                followersLimit: 100, // Should come from Tier/Plan, default for now
                aum: initialMaster.aum,
                aumLimit: 10000,
                monthlyFee: initialMaster.monthlyFee,
                minDeposit: initialMaster.minDeposit || 10,
                roi: initialMaster.roi,
                winRate: initialMaster.winRate || 0,
                drawdown: initialMaster.drawdown || 0,
                isPublic: initialMaster.isPublic
            } as MasterProfile; // Casting to ensure compatibility if types differ slightly
        }
        return {
            name: "",
            desc: "",
            tags: [],
            avatar: "",
            tier: "ROOKIE",
            followersCount: 0,
            followersLimit: 100,
            aum: 0,
            aumLimit: 10000,
            monthlyFee: 0,
            minDeposit: 10, // ✅ Default
            userId: ""
        };
    });
    const [showActivationModal, setShowActivationModal] = useState(false);

    // ⚡ REAL-TIME SYNC
    const { stats: realTimeStats, isConnected: isSyncing, hasAttempted } = useRealTimeData();
    const [ignoreSync, setIgnoreSync] = useState(false); // 🛡️ Prevent race conditions on disconnect
    const [hasSyncedOnce, setHasSyncedOnce] = useState(false); // 🛡️ Protect SSR state from premature overwrite
    const [isManualConnect, setIsManualConnect] = useState(false); // 🛡️ Protect Manual Connect from Lagging Polls

    // ⚡ SYNC REAL-TIME DATA TO GLOBAL STATE (Consolidated)
    useEffect(() => {
        if (ignoreSync) return; // 🛑 Block updates if we are intentionally disconnecting

        if (realTimeStats) {
            setHasSyncedOnce(true);
            setIsManualConnect(false); // ✅ Poller caught up. Guard lifted.

            // ✅ Sync Live Data to Main State
            setBrokerAccount(prev => {
                if (!prev) return realTimeStats as any;
                return { ...prev, ...realTimeStats };
            });

            // ✅ Auto-Correction: If we have stats, we are CONNECTED
            setAccountStatus("CONNECTED");
        } else if (hasAttempted && !realTimeStats && accountStatus === "CONNECTED" && !isManualConnect) {
            // ⚠️ Hook processed first poll and found NO Session (404)
            // Downgrade immediately to resolve Stale SSR state.
            setAccountStatus("DISCONNECTED");
        }
    }, [realTimeStats, isSyncing, accountStatus, ignoreSync, hasSyncedOnce, hasAttempted, isManualConnect]);

    useEffect(() => {
        if (realTimeStats?.activeSessions) {
            const activeMap = new Map(realTimeStats.activeSessions.map(s => [s.id, s]));

            setActiveSessions(prev => {
                const now = Date.now();
                // 1. Keep sessions that are:
                //    a) In the backend response (still active)
                //    b) Optimistic (ID > 1700000000000) AND Created < 15s ago (Give backend time to catch up)
                const merged = prev.filter(s => {
                    const isConfirmed = activeMap.has(s.id);
                    // Check if optimistic: ID looks like timestamp?
                    const isOptimistic = typeof s.id === 'number' && s.id > 1700000000000;
                    // Note: Optimistic sessions use `startTime` as creation time
                    const isRecent = (now - s.startTime) < 15000;

                    return isConfirmed || (isOptimistic && isRecent);
                });

                // 2. Add/Update from Backend
                const final = merged.map(s => {
                    const fresh = activeMap.get(s.id);
                    if (fresh && fresh.expiry) {
                        const freshExpiryNum = typeof fresh.expiry === 'number' ? fresh.expiry : new Date(fresh.expiry).getTime();

                        // Update details: Update expiry if changed
                        if (freshExpiryNum !== s.expiry) {
                            return { ...s, expiry: freshExpiryNum };
                        }
                        return s;
                    }
                    return s;
                });

                // 3. (Removed) Do not append new sessions from RealTimeStats as they lack distinct Master data.
                // The global poller (5s) will handle fetching new sessions with full details.

                // Only update state if length changed or deep change
                if (JSON.stringify(final) !== JSON.stringify(prev)) {
                    return final;
                }
                return prev;
            });
        }
    }, [realTimeStats?.activeSessions]);


    // 🔄 SYNC WITH DB ON LOGIN
    useEffect(() => {
        if (session?.user?.id) {
            setIsLoggedIn(true);
            setCurrentUserId(session.user.id);

            getUserProfile(session.user.id).then(user => {
                if (user) {
                    if (user.role) setUserRole(user.role as UserRole);
                    // Only enforce Master view if URL doesn't specify otherwise AND not looking at a profile
                    // AND if user hasn't explicitly chosen Follower mode previously
                    const savedView = typeof window !== "undefined" ? localStorage.getItem("last_view_mode") : null;
                    if (user.role === "MASTER" && !searchParams.get("view") && !initialSlug && !initialProfileId) {
                        if (savedView !== "FOLLOWER") {
                            setViewMode("MASTER");
                        }
                    }
                    if (user.masterProfile) {
                        // Merge with existing structure, sanitizing nulls
                        const mp = user.masterProfile;
                        setMasterProfile(prev => ({
                            ...prev,
                            ...mp,
                            userId: session.user?.id || mp.userId, // ✅ FORCE ID from Session
                            username: mp.username || undefined, // ✅ Sanitize null to undefined
                            desc: mp.desc || prev.desc || "",
                            avatar: mp.avatar || prev.avatar || "",
                            tags: mp.tags || prev.tags || []
                        }));
                    } else {
                        // ✅ NEW USER: Ensure ID is set even if no profile exists
                        setMasterProfile(prev => ({ ...prev, userId: session.user?.id || "" }));
                    }
                    if (user.brokerAccount) {
                        setAccountStatus("CONNECTED");
                        setBrokerAccount(user.brokerAccount); // ✅ Set State
                    }
                    if (user.favorites) setFavorites(user.favorites); // ✅ Load Favorites (Correctly placed)
                }
            });
        }
    }, [session]);

    // 💾 UPDATE MASTER PROFILE (Server Action)
    const handleUpdateMasterProfile = async (updatedProfile: MasterProfile) => {
        setMasterProfile(updatedProfile); // Optimistic Update

        if (session?.user?.id) {
            const toastId = toast.loading("Saving Profile...");
            const res = await updateMasterProfile(session.user.id, updatedProfile);
            if (res.success) {
                toast.success("Profile Saved", { id: toastId });
                // 🔄 Force Refresh List to ensure consistency
                fetchMasters().then(data => {
                    setRealMasters(data);
                    // Also update viewing profile if it matches self
                    if (viewingProfile && (viewingProfile.userId === session.user?.id || viewingProfile.id === 0)) {
                        const me = data.find(d => d.userId === session.user?.id);
                        if (me) setViewingProfile(prev => ({ ...prev, ...me }));
                    }
                });
            } else {
                toast.error("Save Failed", { id: toastId, description: res.error });
            }
        }
    };

    // ⚡ GLOBAL SOCKET LISTENER (Real-Time Updates across App)
    useEffect(() => {
        // Connect to Socket Server
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3001` : "http://localhost:3001");

        // Dynamically import socket.io-client to avoid SSR issues if strictly client-side, 
        // but typically we can just import at top if "use client" is set. 
        // Using dynamic import here for safety or standard import if available.
        // Since we are adding logic inside existing component, let's assume 'io' needs to be imported.
        // We will add the import at the top in a separate step if needed, or use require here.
        // But cleaner to assume import. I will add import in separate edit if needed.
        // For now, I'll use `import("socket.io-client")` promise or just assume I'll add the import line.
        // Actually, I can't add import *and* this block in one 'replace_file_content' unless I replace the whole file or large chunk.
        // So I will use `require` or rely on a second edit.
        // Let's use standard import in a separate edit 2.
        // WAIT, I really should add the import.

        // Let's check if I can use window.io (CDN) or just standard import. Be safe:
        import("socket.io-client").then(({ io }) => {
            const socket = io(socketUrl);

            socket.on("master_updated", (updatedProfile: any) => {
                // 1. Update List (Discovery)
                setRealMasters(prev => prev.map(m => {
                    const match = (m.userId === updatedProfile.userId) || (m.id === updatedProfile.id) || (m.username && updatedProfile.username && m.username === updatedProfile.username);
                    if (match) {
                        return { ...m, ...updatedProfile };
                    }
                    return m;
                }));

                // 2. Update Viewing Profile (if active)
                setViewingProfile(curr => {
                    if (curr) {
                        const match = (curr.userId === updatedProfile.userId) || (curr.id === updatedProfile.id) || (curr.username && updatedProfile.username && curr.username === updatedProfile.username);
                        if (match) return { ...curr, ...updatedProfile };
                    }
                    return curr;
                });

                // 3. Update Self (if Master)
                if (currentUserId && updatedProfile.userId === currentUserId) {
                    setMasterProfile(prev => ({ ...prev, ...updatedProfile }));
                }
            });

            return () => {
                socket.disconnect();
            };
        });
    }, [currentUserId]);

    // 🔔 GLOBAL CONFIRMATION MODAL STATE
    const [globalModal, setGlobalModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: "info" | "danger" | "success" | "warning";
        onConfirm: () => void
    }>({
        isOpen: false, title: "", message: "", type: "info", onConfirm: () => { }
    });

    const openGlobalModal = (title: string, message: string, onConfirm: () => void = () => { setGlobalModal(p => ({ ...p, isOpen: false })) }, type: "info" | "danger" | "success" | "warning" = "info") => {
        setGlobalModal({ isOpen: true, title, message, type, onConfirm });
    };

    // 💰 MASTER WALLET STATE
    const [showWallet, setShowWallet] = useState(false);
    const [savedBankAccount, setSavedBankAccount] = useState<{ id: string, name: string, account: string, bank: string } | null>(null);
    const [masterTransactions, setMasterTransactions] = useState<Transaction[]>([]);

    const handleWithdrawal = (amount: number, bankDetails: any = {}) => {
        const newTx: Transaction = {
            id: `tx_${Date.now()} `,
            type: "WITHDRAWAL",
            title: "Withdrawal Request",
            amount: -amount,
            date: Date.now(),
            status: "PENDING",
            meta: bankDetails
        };
        setMasterTransactions(prev => [newTx, ...prev]);
        toast.info("Withdrawal Requested", { description: "Your request is being processed." });
    };

    const handleCancelWithdrawal = (id: string) => {
        setMasterTransactions(prev => prev.map(t =>
            t.id === id ? { ...t, status: "CANCELLED" } : t
        ));
        toast.success("Request Cancelled", { description: "Funds have been returned to your wallet." });
    };


    // Modals
    const [showSettings, setShowSettings] = useState(false);
    const [showVIP, setShowVIP] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [showStopAll, setShowStopAll] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);

    // ✅ Initialize with Server Data
    const [realMasters, setRealMasters] = useState<Master[]>(initialMasters || []);

    // 🔍 VIEWING STATE (Refactored to Object for Self-View Support)


    // 🔍 VIEWING STATE (Refactored to Object for Self-View Support)
    const [viewingProfile, setViewingProfile] = useState<Master | null>(() => {
        // Only set default viewing profile if we are on a Target Profile Page (has Slug)
        if (initialSlug && initialMaster) return initialMaster;
        return null;
    });

    const [viewingFollower, setViewingFollower] = useState<any | null>(null);
    const [startOnBroker, setStartOnBroker] = useState(false);

    useEffect(() => {
        // Sync Viewing Profile with URL/Server State
        // If we have a slug, we MUST show that profile.
        if (initialSlug && initialMaster) {
            setViewingProfile(initialMaster);
        } else if (!initialSlug && !searchParams.get("profile")) {
            // If NO slug and NO profile param, ensure we are closed (Fixes Back Nav bug)
            setViewingProfile(null);
        }
    }, [initialMaster, initialSlug, searchParams]);

    useEffect(() => {
        if (status === "unauthenticated") {
            setIsLoggedIn(false);
            // ALLOW GUEST MODE: Do not auto-show login
            // if (isClient) setShowLogin(true); 
        } else if (status === "authenticated" && session?.user) {
            setIsLoggedIn(true);
            setShowLogin(false);

            // Sync User Data from Session
            if (session.user.role) setUserRole(session.user.role as UserRole);
            if (session.user.id) {
                setCurrentUserId(session.user.id);
                // Fetch Active Sessions (Persistence)
                getActiveSessions(session.user.id).then((sessions: any) => {
                    setActiveSessions(sessions);

                    // 🎟️ SYNC TICKET STATUS
                    getTicketStatuses(session.user.id!).then(status => {
                        if (status) {
                            // setDailyTicketUsed(status.dailyUsed); // Derived state, no-op used.
                            setHasUsed7DayTrial(status.welcomeUsed);
                        }
                    });
                });
            }

            // Fetch Broker Account
            // Fetch Broker Account
            getBrokerAccount().then((account: any) => {
                if (account) {
                    setBrokerAccount(account);
                    setAccountStatus(account.status as AccountStatus); // Sync global status
                    setWalletBalance(account.balance); // Sync wallet balance
                }
            });

            // Initial Fetch of Masters
            fetchMasters().then((data) => {
                setRealMasters(data);
                setMastersLoaded(true);
            }).catch(e => {
                console.error(e);
                setMastersLoaded(true); // Ensure we don't block
            });

            // 🔄 REAL-TIME POLLING (Every 5s)
            // 🔄 REAL-TIME POLLING (Redundant - Handled by useRealTimeData hook)
            // Removed 5s interval to prevent state conflicts/flicker.
            // setBrokerAccount and setAccountStatus are now driven by the 1s Hook.

            // Cleanup handled by hooks
            return () => { };

        } else if ((status as string) === "unauthenticated") {
            setIsLoggedIn(false);
        }
    }, [status, session, setIsLoggedIn, setShowLogin, setUserRole, setCurrentUserId]);

    // 🌍 PUBLIC: Fetch Masters on Mount (Regardless of Auth)
    useEffect(() => {
        // ✅ SKIP if already hydrated from Server
        if (initialMasters && initialMasters.length > 0) {
            setMastersLoaded(true);
            return;
        }

        fetchMasters().then((data) => {
            setRealMasters(data);
            setMastersLoaded(true);
        }).catch(e => {
            console.error("Fetch Masters Error", e);
            setMastersLoaded(true); // Ensure hydration continues even if fetch fails
        });
    }, []);

    // url hydration effect for PROFILE (ID or SLUG)
    useEffect(() => {
        // console.log("🔍 Hydration Effect Triggered", { mastersLoaded, viewingProfile: !!viewingProfile, initialSlug, mastersCount: realMasters.length });

        // ✅ FIX: If initialMaster is provided (Server-Side), DO NOT run client hydration logic.
        // This prevents overwriting the detailed server object with a generic list object.
        if (mastersLoaded && !viewingProfile && !initialMaster) {
            // 1. Slug Lookup (Priority)
            if (initialSlug) {
                const master = realMasters.find(m => m.username?.toLowerCase() === initialSlug.toLowerCase());
                if (master) {
                    setViewingProfile(master);
                    // 🧹 CLEANUP: If we have param artifact, remove it
                    if (searchParams.get("profile")) {
                        router.replace(pathname);
                    }
                } else {
                    // ⚡ DIRECT ACCESS FALLBACK: It might be a PRIVATE profile (excluded from fetchMasters)
                    // or simply not in the batch. Fetch explicitly.
                    console.log("⚡ Calling fetchMasterByUsername for:", initialSlug);
                    fetchMasterByUsername(initialSlug).then(m => {
                        console.log("📬 Fetch Result:", m ? "FOUND" : "NULL");
                        if (m) {
                            setViewingProfile(m);
                            // Cleanup param if present
                            if (searchParams.get("profile")) router.replace(pathname);
                        } else {
                            // ❌ Not Found (Stop Loading)
                            console.warn("❌ Profile Not Found");
                            setProfileNotFound(true);
                        }
                    }).catch(e => {
                        console.error("🔥 Fetch Error:", e);
                        setProfileNotFound(true);
                    });
                }
            }
            // 2. ID Lookup (Fallback / Internal)
            else if (initialProfileId) {
                const TARGET_ID = initialProfileId;
                const master = realMasters.find(m => m.id === TARGET_ID);
                if (master) setViewingProfile(master);
            }
            // 3. User Self-View (Refresh Support)
            else if (searchParams.get("profile") === "me" && userRole === "MASTER") {
                // Construct "Me" object on the fly for hydration
                const myProfileAsMaster: Master = {
                    id: 9999,
                    userId: currentUserId || "",
                    name: masterProfile.name,
                    type: "HUMAN",
                    winRate: masterProfile.winRate || 0,
                    roi: masterProfile.roi || 0,
                    pnlText: "$0",
                    followers: masterProfile.followersCount,
                    balance: 0,
                    risk: masterProfile.riskScore || 1,
                    drawdown: masterProfile.drawdown || 0,
                    profitFactor: 0,
                    avatar: masterProfile.avatar,
                    desc: masterProfile.desc,
                    tags: masterProfile.tags,
                    joined: "2026",
                    currentOrders: [],
                    monthlyFee: masterProfile.monthlyFee,
                    isPremium: masterProfile.monthlyFee > 0,
                    isPublic: masterProfile.isPublic ?? true,
                    aum: masterProfile.aum,
                    minDeposit: masterProfile.minDeposit || 10,
                    leverage: (brokerAccount?.status === "CONNECTED") ? (brokerAccount.leverage) : 0,
                    riskReward: 0,
                    tier: masterProfile.tier
                };
                setViewingProfile(myProfileAsMaster);
            }
        }
    }, [initialProfileId, initialSlug, realMasters, viewingProfile, searchParams, pathname, router, masterProfile, userRole, brokerAccount, mastersLoaded, currentUserId]); // Added deps

    // 🔄 GLOBAL POLLING (Masters - Works for Guests too)
    useEffect(() => {
        const fetchAllMasters = () => {
            fetchMasters().then(masters => {
                setRealMasters(masters);
                // ⚡ OPTIMIZATION: Do not update viewingProfile from generic list poll.
                // MasterProfileView handles its own real-time updates via Socket.
                // This prevents "flicker" where detailed server data is overwritten by summary list data.
            }).catch(console.error);
        };

        // Initial Fetch
        fetchAllMasters();

        // Poll every 5s
        const interval = setInterval(fetchAllMasters, 900000); // 15 Minutes Polling
        return () => clearInterval(interval);
    }, []);



    const requireAuth = (action: () => void) => { if (!isLoggedIn) setShowLogin(true); else action(); };

    const handleSwitchView = (targetMode: UserRole) => {
        requireAuth(() => {
            if (userRole === "MASTER" && targetMode === "FOLLOWER") {
                setViewMode(targetMode); setViewingProfile(null); setViewingFollower(null);
            } else {
                setViewMode(targetMode); setViewingProfile(null); setViewingFollower(null);
            }
        });
    };


    const handleToggleFavorite = async (e?: React.MouseEvent, masterId?: number) => {
        if (e) e.stopPropagation();
        const idToToggle = masterId;
        if (!currentUserId || !idToToggle) return;

        // Optimistic Update
        const wasFav = favorites.includes(idToToggle);
        setFavorites(prev => wasFav ? prev.filter(id => id !== idToToggle) : [...prev, idToToggle]);

        // Server Action
        import('@/app/actions/user').then(({ toggleFavorite }) => {
            toggleFavorite(currentUserId, idToToggle).then(res => {
                if (res.success) {
                    toast.success(wasFav ? "Removed from Favorites" : "Added to Favorites ❤️");
                } else {
                    // Rollback
                    setFavorites(prev => wasFav ? [...prev, idToToggle] : prev.filter(id => id !== idToToggle));
                    toast.error("Failed to update favorites");
                }
            });
        });
    };

    const startCopying = (master: Master, amount: number, risk: number | string, sessionType: SessionType, advanced?: { autoRenew: boolean, timeConfig: any, invertCopy?: boolean, copyMode?: "FIXED" | "EQUITY" }) => {
        // 🔒 -1. CHECK: AUTH
        if (!isLoggedIn) {
            setShowLogin(true);
            return;
        }

        // 🔒 0. CHECK: BROKER CONNECTION
        if (accountStatus !== "CONNECTED") {
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Broker Account first!" });
            setStartOnBroker(true);
            setShowSettings(true);
            return;
        }

        if (userRole === "MASTER") { openGlobalModal("🚫 Spy Mode", "You are a Master. You cannot copy others.", () => { }, "warning"); return; }

        // 🛡️ 1. CHECK: 7-DAY TRIAL (One-Time Life)
        if (sessionType === "TRIAL_7DAY") {
            if (hasUsed7DayTrial) {
                openGlobalModal(
                    "⚠️ Trial Already Used",
                    "You have already used your 7-Day Free Trial.\nThis is a one-time offer.\n\nPlease upgrade to VIP to continue copying Premium Masters.",
                    () => setShowVIP(true),
                    "warning"
                );
                return;
            }
        }

        // 🛡️ 2. CHECK: NO DOUBLE DIPPING (Limit 1 Master for Non-VIP)
        const isUnlimitedUser = sessionType === "PAID";
        if (!isUnlimitedUser && activeSessions.length >= 1) {
            openGlobalModal(
                "🚫 Limit Reached (1 Master Max)",
                "You are on a Free/Trial plan. You can only follow 1 Master at a time.\n\nSubscribe to a Paid Signal for Unlimited Copying!",
                () => { },
                "warning"
            );
            return;
        }

        if (amount > walletBalance) {
            openGlobalModal("Insufficient Balance", "Please top up your wallet to continue.", () => { });
            return;
        }

        // Calculate Expiry
        let expiry: number | null = null;
        if (sessionType === "TRIAL_7DAY") expiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
        else if (sessionType === "DAILY") expiry = Date.now() + (10 * 365 * 24 * 60 * 60 * 1000); // Unlimited (10 Years) for Standard Pass

        // 🔥 INJECT COPY MODE into TimeConfig (DB Hack to avoid Schema Change)
        // Ensure we preserve existing timeConfig properties
        const finalTimeConfig = {
            ...(advanced?.timeConfig || {}),
            copyMode: advanced?.copyMode || "EQUITY" // 🛠️ FORCE DEFAULT TO EQUITY
        };

        const masterUserId = String(master.id);

        // Optimistic UI Update first
        const newSession: CopySession = {
            id: Date.now(),
            master: master,
            allocation: amount,
            risk: risk,
            startTime: Date.now(),
            pnl: 0,
            orders: master.currentOrders,
            isTrial: sessionType === "TRIAL_7DAY",
            type: sessionType,
            expiry: expiry
        };

        setActiveSessions([...activeSessions, newSession]);
        setWalletBalance(prev => prev - amount);
        // 🛠️ DEBUG: Default to EQUITY if missing
        const debugMode = advanced?.copyMode || "EQUITY";
        const toastId = toast.loading(`Processing Investment... (Mode: ${debugMode})`);

        // Server Action
        if (!master.userId) {
            toast.error("Error: Master ID missing");
            return;
        }
        startCopySession(
            currentUserId!,
            master.userId,
            amount,
            Number(risk),
            sessionType as SessionType,
            advanced?.autoRenew ?? true, // Default true
            finalTimeConfig, // ✅ Pass Combined Config
            undefined, // dailyLimit
            undefined, // minEquity
            advanced?.invertCopy // ✅ Invert Copy
        ) // Casting logic
            .then(res => {
                if (res.success && res.data) {
                    toast.success("Investment Active! 🚀", { id: toastId, description: "Funds allocated to Master." });

                    // ✨ OPTIMISTIC UPDATE: Increment Follower Count Immediately
                    setRealMasters(prev => prev.map(m =>
                        m.id === master.id ? { ...m, followers: m.followers + 1 } : m
                    ));

                    // 🔄 FORCE SYNC: Replace Optimistic Session with Real DB Data immediately
                    getActiveSessions(currentUserId!).then(realSessions => {
                        if (realSessions) {
                            // Merge with current state carefully (preserving other optimistics if any)
                            // But for 'startCopying', replacing completely is safer as this is the authoritative list.
                            setActiveSessions(realSessions as CopySession[]);
                        }
                    });

                    // ✅ CRITICAL PATCH: Update the optimistic session with the REAL DB ID & EXPIRY
                    const realSession = (res.data as any);
                    const realSessionId = realSession.id;
                    const realExpiry = realSession.expiry ? new Date(realSession.expiry).getTime() : null; // Convert to timestamp

                    setActiveSessions(prev => prev.map(s =>
                        s.id === newSession.id ? { ...s, id: realSessionId, expiry: realExpiry } : s
                    ));
                } else {
                    toast.error("Investment Failed", { id: toastId, description: res.error });
                    // Rollback
                    setActiveSessions(prev => prev.filter(s => s.id !== newSession.id));
                    setWalletBalance(prev => prev + amount);

                    // ↩️ Rollback Ticket State
                    if (sessionType === "DAILY") {/* setDailyTicketUsed(false) - AUTO */ }
                    if (sessionType === "TRIAL_7DAY") setHasUsed7DayTrial(false);
                }
            })
            .catch(err => {
                toast.error("Connection Error", { id: toastId, description: "Please try again." });
                setActiveSessions(prev => prev.filter(s => s.id !== newSession.id));
                setWalletBalance(prev => prev + amount);
                if (sessionType === "DAILY") {/* setDailyTicketUsed(false) - AUTO */ }
                if (sessionType === "TRIAL_7DAY") setHasUsed7DayTrial(false);
            });

        // Update State based on Type
        if (sessionType === "TRIAL_7DAY") {
            setHasUsed7DayTrial(true);
            toast.success("7-Day Free Trial Started!", { description: "Use it wisely. Copying active." });
        } else if (sessionType === "DAILY") {
            // setDailyTicketUsed(true); // Derived automatically
        }
    };

    const stopCopying = async (masterId: number, confirmed: boolean = false) => {
        // Find session
        const session = activeSessions.find(s => s.master.id === masterId);
        if (!session) return;

        const executeStop = () => {
            // Optimistic Client Update
            setWalletBalance(prev => prev + session.allocation);
            setActiveSessions(prev => prev.filter(s => s.master.id !== masterId));

            // Decrement follower count locally immediately
            setRealMasters(prev => prev.map(m =>
                m.id === session.master.id ? { ...m, followers: Math.max(0, m.followers - 1) } : m
            ));

            console.log("🛑 Client: Stopping session", session.id); // Log added
            // Server Action
            stopCopySession(session.id).then(res => {
                if (res.success) {
                    toast.success("Stopped Copying");
                } else {
                    console.error("❌ Server Action Failed:", res.error);
                    toast.error("Failed to update status on server");

                    // Rollback on failure
                    // We should probably re-fetch but for now just warn
                    // Or ideally revert the optimistic update by re-adding the session
                    getActiveSessions(currentUserId!).then(realSessions => {
                        setActiveSessions(realSessions as CopySession[]);
                    });
                }
            });

            setGlobalModal(p => ({ ...p, isOpen: false }));
        };

        if (confirmed) {
            executeStop();
        } else {
            openGlobalModal(
                "Stop Copying?",
                `Stop copying ${session.master.name}? This will mark the session as inactive.`,
                executeStop,
                "danger"
            );
        }
    };

    const confirmStopAll = async () => {
        if (!currentUserId) return;

        // Optimistic UI updates
        let totalReturn = 0;
        activeSessions.forEach(s => { totalReturn += s.allocation + (s.pnl || 0); });
        setWalletBalance(prev => prev + totalReturn);
        setActiveSessions([]);

        // Decrement follower count for all stopped masters locally
        activeSessions.forEach(s => {
            setRealMasters(prev => prev.map(m =>
                m.id === s.master.id ? { ...m, followers: Math.max(0, m.followers - 1) } : m
            ));
        });

        setShowStopAll(false);
        const toastId = toast.loading("Stopping All Sessions...");

        const res = await stopAllActiveSessions(currentUserId);

        if (res.success) {
            toast.success("Emergency Stop Executed", { id: toastId, description: "All active sessions have been stopped." });
        } else {
            toast.error("Failed to stop all sessions", { id: toastId, description: res.error });
            // Optional: reload page or fetch sessions to revert optimistic state if you want strict consistency
        }
    };

    const confirmActivation = async (fee: number) => {
        if (!session?.user?.id) return;

        // 🚀 FAST PRE-CHECK: Redirect immediately if no broker
        if (accountStatus !== "CONNECTED") {
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Trading Account first." });
            setShowActivationModal(false);
            setStartOnBroker(true);
            setShowSettings(true);
            return;
        }

        const toastId = toast.loading("Activating Master Mode...");

        const result = await activateMasterAccount(session.user.id, fee);

        if (result.success) {
            setMasterProfile(prev => ({ ...prev, monthlyFee: fee }));
            setUserRole("MASTER");
            setViewMode("MASTER");
            setShowActivationModal(false);
            fetchMasters(); // 🔄 Trigger re-fetch (cache invalidation hint if needed, or just let re-mount handle it)
            // Note: setRealMasters is not available here as it's in FollowerFlow. 
            // When user switches view, FollowerFlow will remount and fetch fresh data.
            toast.success("Welcome, Master!", { id: toastId, description: `Your subscription fee is set to $${fee} /month.` });
        } else {
            toast.error("Activation Failed", { id: toastId, description: result.error });

            // 🟢 Smart Redirect: If error is due to missing broker, open settings
            if (result.error?.toLowerCase().includes("broker") || result.error?.toLowerCase().includes("mt5")) {
                setTimeout(() => {
                    setShowActivationModal(false); // Close the blocking modal
                    setStartOnBroker(true);
                    setShowSettings(true);
                }, 1000);
            }
        }
    };

    const handleBecomeMasterRequest = () => {
        if (accountStatus !== "CONNECTED") {
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Trading Account first." });
            setStartOnBroker(true);
            setShowSettings(true);
            return;
        }

        // 🛡️ GUARD: Stop Copies before Upgrade
        if (activeSessions.length > 0) {
            openGlobalModal(
                "⚠️ Active Copies Detected",
                "To become a Master, you must stop copying other traders.\n\nProceed to STOP ALL sessions and continue?",
                async () => {
                    await confirmStopAll(); // 🛑 Stop Everything

                    // Then Proceed
                    setShowSettings(true);
                    setTimeout(() => setShowActivationModal(true), 300);
                },
                "danger"
            );
            return;
        }

        setShowSettings(true);
        setTimeout(() => setShowActivationModal(true), 300);
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        setViewMode("FOLLOWER");
        setShowSettings(false);
        signOut({ callbackUrl: "/" });
    };

    // ✅ Wrapper to handle Disconnect > Pause Sync logic
    const handleBrokerUpdate = (account: any) => {
        if (account.status === "DISCONNECTED") {
            setIgnoreSync(true); // 🛑 Stop listening to real-time events temporarily
            setAccountStatus("DISCONNECTED");
        } else {
            // If manual connect, re-enable sync
            setIgnoreSync(false);
            setIsManualConnect(true); // 🛡️ Prevent immediate downgrade by lagging poller
            setAccountStatus(account.status);
        }
        setBrokerAccount(account);
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans pb-24 selection:bg-green-500 selection:text-black">
            <style jsx global>{` .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } `}</style>

            {isClient && <Navbar
                viewMode={viewMode} onSwitch={handleSwitchView}
                wallet={walletBalance} status={accountStatus}
                isLoggedIn={isLoggedIn}
                onOpenSettings={() => requireAuth(() => setShowSettings(true))}
                onLogin={() => setShowLogin(true)}
                onBecomeMaster={userRole === "FOLLOWER" ? () => requireAuth(handleBecomeMasterRequest) : undefined}
                onOpenWallet={() => requireAuth(() => setShowWallet(true))}
            />}
            {!isClient && <div className="h-20 bg-gray-900 border-b border-gray-800 animate-pulse"></div>}

            <div className="pt-24 px-4 max-w-7xl mx-auto">
                {isClient && isLoggedIn && accountStatus === "ERROR" && <div onClick={() => setShowSettings(true)} className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl mb-4 flex items-center justify-between animate-pulse cursor-pointer"><div className="flex items-center gap-3"><AlertTriangle className="text-red-500" /><div><p className="font-bold text-sm text-red-400">Connection Error</p><p className="text-[10px] text-gray-400">Tap to reconnect.</p></div></div><span className="text-xs font-bold text-red-500 underline">Fix</span></div>}

                {isClient && userRole === "MASTER" && viewMode === "FOLLOWER" && (
                    <div className="mb-4 bg-purple-900/30 border border-purple-500/50 p-3 rounded-xl flex items-center gap-3">
                        <Eye className="text-purple-400" size={20} />
                        <div><p className="text-xs font-bold text-purple-200">Spy Mode Active</p><p className="text-[10px] text-purple-400/80">You are a master. Copying is disabled.</p></div>
                    </div>
                )}

                {/* Fix Hydration: Only render view logic on client */}
                {isClient && viewMode === "FOLLOWER" ? (
                    // ⏳ LOADING GUARD: If slug present but profile not loaded yet, show skeleton
                    (initialSlug && !viewingProfile && !profileNotFound) ? (
                        <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
                            {/* Profile Header Skeleton ONLY - Let the content fill the rest naturally */}
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-24 h-24 bg-gray-800 rounded-full animate-pulse shrink-0"></div>
                                <div className="space-y-4 w-full">
                                    <div className="h-8 w-64 bg-gray-800 rounded animate-pulse"></div>
                                    <div className="h-4 w-96 bg-gray-800/50 rounded animate-pulse"></div>
                                    <div className="flex gap-2 pt-2">
                                        <div className="h-6 w-20 bg-gray-800 rounded-full animate-pulse"></div>
                                        <div className="h-6 w-20 bg-gray-800 rounded-full animate-pulse"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : profileNotFound ? (
                        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 animate-in fade-in">
                            <div className="p-4 bg-muted/20 rounded-full"><Search size={48} className="text-gray-500" /></div>
                            <h2 className="text-2xl font-bold text-white">Profile Not Found</h2>
                            <p className="text-gray-400">The user "{initialSlug}" does not exist or has been removed.</p>
                            <Button variant="outline" onClick={() => router.push("/")}>Go Back</Button>
                        </div>
                    ) : viewingProfile ? (
                        <MasterProfileView
                            master={viewingProfile}
                            onBack={() => {
                                // If we are on a slug page (initialSlug is set), we should go HOME.
                                if (initialSlug) {
                                    // ✅ FIX: Restore Tab State
                                    const returnTab = searchParams.get("tab") || "market";
                                    router.push(`/?tab=${returnTab}`);
                                    // router.push("/"); 
                                    // DO NOT set viewingProfile(null) here.
                                    // Reason: If we clear state while initialSlug prop is still true (during nav transition),
                                    // the hydration useEffect will immediately re-open the profile, causing a flicker/double-click issue.
                                    // We let the Page Unmount handle the cleanup.
                                } else {
                                    // Otherwise clear param (legacy/ID mode)
                                    setViewingProfile(null);
                                    router.push(pathname + "?" + createQueryString([{ name: "profile", value: null }]));
                                }
                            }}
                            requireAuth={requireAuth}
                            isFav={favorites.includes(viewingProfile.id)} onToggleFav={() => handleToggleFavorite(undefined, viewingProfile.id)}
                            onStartCopy={startCopying} onStopCopy={stopCopying} isCopying={activeSessions.some(s => s.master.id === viewingProfile.id)}
                            maxAlloc={walletBalance}
                            userRole={userRole}
                            hasUsed7DayTrial={hasUsed7DayTrial}
                            accountStatus={accountStatus}
                            onOpenSettings={() => requireAuth(() => { setStartOnBroker(true); setShowSettings(true); })}
                            dailyTicketUsed={dailyTicketUsed}
                            isOwner={viewingProfile.id === 9999 || Boolean(session?.user?.id && viewingProfile.userId === session.user.id)}
                        />
                    ) : (
                        <FollowerFlow
                            requireAuth={requireAuth}
                            onViewProfile={(master) => {
                                if (master.username) {
                                    // 🚀 FAST ROUTE: Just push URL, let page load.
                                    // Do NOT set local state, forcing "double load".
                                    // ✅ FIX: Pass Tab State
                                    const currentTab = searchParams.get("tab") || "market";
                                    router.push(`/${master.username}?tab=${currentTab}`);
                                } else {
                                    // Legacy/ID Mode: Open Overlay
                                    setViewingProfile(master);
                                    router.push(pathname + "?" + createQueryString([{ name: "profile", value: String(master.id) }]));
                                }
                            }}
                            activeSessions={activeSessions} onStopCopy={stopCopying} onStartCopy={startCopying}
                            favorites={favorites} walletBalance={walletBalance}
                            onStopAll={() => setShowStopAll(true)}
                            dailyTicketUsed={dailyTicketUsed}
                            setDailyTicketUsed={setDailyTicketUsed} // ✅ Pass Setter
                            userRole={userRole}
                            onToggleFav={handleToggleFavorite}
                            hasUsed7DayTrial={hasUsed7DayTrial}
                            setHasUsed7DayTrial={setHasUsed7DayTrial} // ✅ Added Prop
                            brokerAccount={brokerAccount}
                            masters={realMasters} // ✅ Pass State
                            masterProfile={masterProfile} // ✅ Pass Master Profile
                            defaultTab={initialTab}
                            onTabChange={(tab) => router.push(pathname + "?" + createQueryString([{ name: "tab", value: toUrlTab(tab) }]))}
                        />
                    )
                ) : isClient ? (
                    viewingProfile ? (
                        <MasterProfileView
                            master={viewingProfile}
                            onBack={() => {
                                setViewingProfile(null);
                                if (initialSlug) {
                                    router.push("/");
                                } else {
                                    // In Master View, we might just want to close the profile view if it was an overlap
                                    // But if we were at a slug, go home.
                                    // If internal Nav, just nullify.
                                    router.push(pathname + "?" + createQueryString([{ name: "profile", value: null }]));
                                }
                            }}
                            requireAuth={requireAuth}
                            isFav={favorites.includes(viewingProfile.id)} onToggleFav={() => handleToggleFavorite(undefined, viewingProfile.id)}
                            onStartCopy={startCopying} onStopCopy={stopCopying} isCopying={activeSessions.some(s => s.master.id === viewingProfile.id)}
                            maxAlloc={walletBalance}
                            userRole={userRole}
                            hasUsed7DayTrial={hasUsed7DayTrial}
                            accountStatus={accountStatus}
                            onOpenSettings={() => requireAuth(() => { setStartOnBroker(true); setShowSettings(true); })}
                            dailyTicketUsed={dailyTicketUsed}
                            isOwner={viewingProfile.id === 9999 || Boolean(session?.user?.id && viewingProfile.userId === session.user.id)}
                            initialAnalytics={(initialMaster && viewingProfile.userId === initialMaster.userId) ? initialAnalytics : null}
                        />
                    ) : viewingFollower ?
                        <FollowerDetailView follower={viewingFollower} onBack={() => setViewingFollower(null)} />
                        :
                        <MasterFlow
                            onOpenSettings={() => setShowSettings(true)}
                            onViewFollower={setViewingFollower}
                            userRole={userRole}
                            profile={masterProfile}
                            setProfile={handleUpdateMasterProfile}
                            onOpenWallet={() => setShowWallet(true)}
                            onBecomeMaster={handleBecomeMasterRequest}
                            followers={[]} // Using real data (empty initially)
                            brokerAccount={brokerAccount} // ✅ Pass Broker Account
                            onViewProfile={(master) => {
                                setViewingProfile(master);
                                // ✅ FIX: Persist "Me" view in URL to prevent auto-close by useEffect
                                if (master.id === 9999) {
                                    router.push(pathname + "?" + createQueryString([{ name: "profile", value: "me" }]));
                                } else {
                                    router.push(pathname + "?" + createQueryString([{ name: "profile", value: String(master.id) }]));
                                }
                            }}
                        />
                ) : null}
            </div>

            {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setStartOnBroker(false); }} status={accountStatus} setStatus={setAccountStatus} role={userRole} setRole={setUserRole} setViewMode={setViewMode} onLogout={handleLogout}
                activeSessions={activeSessions} onStopAll={() => setShowStopAll(true)} profile={masterProfile} setProfile={handleUpdateMasterProfile} onRequestActivation={() => setShowActivationModal(true)} openConfirm={openGlobalModal} defaultShowBroker={startOnBroker} user={session?.user} brokerAccount={brokerAccount} onConnectionSuccess={handleBrokerUpdate} />}

            {showActivationModal && <MasterActivationModal onClose={() => setShowActivationModal(false)} onConfirm={confirmActivation} />}

            {showActivationModal && <MasterActivationModal onClose={() => setShowActivationModal(false)} onConfirm={confirmActivation} />}
            {/* VIP Modal Removed */}

            {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLoginSuccess={() => { setIsLoggedIn(true); setShowLogin(false); }} />}
            {showStopAll && <StopAllModal onClose={() => setShowStopAll(false)} onConfirm={confirmStopAll} count={activeSessions.length} />}
            {showWallet && <MasterWalletModal onClose={() => setShowWallet(false)} balance={0} transactions={masterTransactions} onWithdraw={handleWithdrawal} savedBank={savedBankAccount} onSaveBank={setSavedBankAccount} onCancelWithdrawal={handleCancelWithdrawal} />}

            {/* Global Confirmation Modal */}
            <ConfirmationModal
                isOpen={globalModal.isOpen}
                onClose={() => setGlobalModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={globalModal.onConfirm}
                title={globalModal.title}
                message={globalModal.message}
                type={globalModal.type}
            />
            <Toaster position="top-center" />
        </div>
    );
}
