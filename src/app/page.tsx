"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    ShieldCheck, Zap, Clock, Users, Lock,
    PlayCircle, StopCircle, BarChart3,
    AlertTriangle, Settings, CheckCircle2,
    X, AlertOctagon, Wallet, Layers,
    Briefcase, UserCircle2, Info, Crown, LogOut, ChevronRight,
    Search, Bot, AreaChart, ChevronLeft,
    BadgeCheck, Edit3, Image as ImageIcon, TrendingUp,
    Server, LogIn, Heart, Radio, Moon, Monitor, CreditCard,
    Save, Eye, DollarSign, Ticket, Sparkles, CalendarDays, ZapIcon,
    SlidersHorizontal, ArrowUpDown
} from "lucide-react";
import { MasterWalletModal } from "@/features/wallet/components/MasterWalletModal";
import { MasterProfileView } from "@/features/social/components/MasterProfileView";
import { ActiveSessionWidget } from "@/features/trading/components/ActiveSessionWidget";
import { SafetyGuardModal } from "@/features/trading/components/SafetyGuardModal";
import { LoginModal } from "@/features/auth/components/LoginModal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Transaction } from "@/features/wallet/types";
import { Navbar } from "@/components/layout/Navbar";
import { CURRENT_USER_DATA } from "@/lib/mock-data";
import { UserRole, AccountStatus, SessionType, Master, Session, Follower, MasterProfile } from "@/types";

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
const INITIAL_BALANCE = 5000.00;

const MOCK_BROKERS = [
    "Exness-MT5Real", "Exness-MT5Trial", "XMGlobal-MT5-Real",
    "ICMarkets-MT5-Live", "Pepperstone-MT5-01", "VantageFX-MT5-Live",
    "RoboForex-Pro-MT5"
];


const mockFollowersList: Follower[] = [
    { id: 101, name: "Somchai_Trader", equity: 1200, pnl: "+$45.00", joined: "2h ago", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Somchai" },
    { id: 102, name: "Alice Wonderland", equity: 5000, pnl: "-$12.50", joined: "1d ago", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice" },
];

const mockMasters: Master[] = [
    {
        id: 1, name: "BridgeGuard AI", type: "AI_BOT",
        winRate: 98, roi: 145, pnlText: "+$2,450", followers: 1250, balance: 50000, risk: 2, drawdown: 5.5, profitFactor: 3.2,
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Guard", isVip: true, desc: "Official House Bot.", tags: ["Safe", "Grid"], joined: "2023",
        currentOrders: [{ symbol: "EURUSD", type: "BUY", lot: 0.05, entry: 1.0850, current: 1.0890, pnl: 20.00 }],
        monthlyFee: 0, isPremium: false
    },
    {
        id: 2, name: "Gold Hunter", type: "AI_BOT",
        winRate: 65, roi: 320, pnlText: "+$15,800", followers: 890, balance: 20000, risk: 8, drawdown: 25.0, profitFactor: 1.8,
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Gold", isVip: true, desc: "High volatility scalper.", tags: ["Aggressive", "Gold"], joined: "2024",
        currentOrders: [{ symbol: "XAUUSD", type: "BUY", lot: 0.10, entry: 2030.50, current: 2035.10, pnl: 46.00 }],
        monthlyFee: 500, isPremium: true
    },
    {
        id: 3, name: "Master Keng", type: "HUMAN",
        winRate: 88, roi: 89, pnlText: "+$12,450", followers: 5420, balance: 10000, risk: 6, drawdown: 18.2, profitFactor: 2.1,
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Keng", isVip: true, desc: "Full-time trader.", tags: ["Day Trade", "Gold"], joined: "2022", currentOrders: [],
        monthlyFee: 1000, isPremium: true
    },
];

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
    return <button onClick={onClick} className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${active ? "bg-white text-black border-white shadow-lg" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}>{label}</button>
}



// --- 2. MODAL COMPONENTS (Defined BEFORE Usage)
// ----------------------------------------------------------------------

interface FilterConfig {
    minProfit: number;
    maxProfit: number;
    minFee: number;
    maxFee: number;
    freeOnly: boolean;
    favoritesOnly: boolean;
    sortBy: "RECOMMENDED" | "PROFIT" | "SAFE" | "POPULAR";
}

interface FilterModalProps {
    config: FilterConfig;
    setConfig: (c: FilterConfig) => void;
    onClose: () => void;
    resultsCount: number;
}

function FilterModal({ config, setConfig, onClose, resultsCount }: FilterModalProps) {
    const handleSort = (type: FilterConfig["sortBy"]) => setConfig({ ...config, sortBy: type });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 shadow-2xl overflow-hidden font-sans">
                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <h3 className="font-bold text-lg text-white flex items-center gap-2"><SlidersHorizontal size={18} className="text-purple-500" /> Filter & Sort</h3>
                    <button onClick={onClose} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"><X size={16} /></button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* 1. Sort By */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><ArrowUpDown size={12} /> Sort By</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["RECOMMENDED", "PROFIT", "SAFE", "POPULAR"] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => handleSort(type)}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${config.sortBy === type ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50" : "bg-gray-800 border-transparent text-gray-400 hover:bg-gray-700"}`}
                                >
                                    {type === "RECOMMENDED" && "✨ Recommended"}
                                    {type === "PROFIT" && "📈 Highest Profit"}
                                    {type === "SAFE" && "🛡️ Lowest Risk"}
                                    {type === "POPULAR" && "🔥 Most Popular"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2. Profit Range */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <label>Min Profit (ROI)</label>
                            <label>Max Profit (ROI)</label>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-2 border border-gray-700 focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-all">
                                <span className="text-sm font-bold text-green-400 select-none">+</span>
                                <input
                                    type="number"
                                    value={config.minProfit}
                                    onChange={(e) => setConfig({ ...config, minProfit: Number(e.target.value) })}
                                    className="w-full bg-transparent text-left text-sm font-bold text-green-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-sm font-bold text-gray-600 select-none text-[10px]">%</span>
                            </div>
                            <div className="w-4 h-0.5 bg-gray-700"></div>
                            <div className="flex-1 flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-2 border border-gray-700 focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-all">
                                <span className="text-sm font-bold text-green-400 select-none">+</span>
                                <input
                                    type="number"
                                    value={config.maxProfit === Infinity ? "" : config.maxProfit}
                                    onChange={(e) => setConfig({ ...config, maxProfit: e.target.value === "" ? Infinity : Number(e.target.value) })}
                                    className="w-full bg-transparent text-left text-sm font-bold text-green-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="∞"
                                />
                                <span className="text-sm font-bold text-gray-600 select-none text-[10px]">%</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. Fee Range */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <label>Min Monthly Fee</label>
                            <label>Max Monthly Fee</label>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-2 border border-gray-700 focus-within:border-yellow-500 focus-within:ring-1 focus-within:ring-yellow-500 transition-all">
                                <span className="text-sm font-bold text-yellow-400 select-none">$</span>
                                <input
                                    type="number"
                                    value={config.minFee}
                                    onChange={(e) => setConfig({ ...config, minFee: Number(e.target.value) })}
                                    className="w-full bg-transparent text-left text-sm font-bold text-yellow-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                            </div>
                            <div className="w-4 h-0.5 bg-gray-700"></div>
                            <div className="flex-1 flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-2 border border-gray-700 focus-within:border-yellow-500 focus-within:ring-1 focus-within:ring-yellow-500 transition-all">
                                <span className="text-sm font-bold text-yellow-400 select-none">$</span>
                                <input
                                    type="number"
                                    value={config.maxFee === Infinity ? "" : config.maxFee}
                                    onChange={(e) => setConfig({ ...config, maxFee: e.target.value === "" ? Infinity : Number(e.target.value) })}
                                    className="w-full bg-transparent text-left text-sm font-bold text-yellow-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="∞"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 4. Toggles */}
                    <div onClick={() => setConfig({ ...config, freeOnly: !config.freeOnly })} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${config.freeOnly ? "bg-green-500" : "bg-gray-700"}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config.freeOnly ? "translate-x-4" : ""}`} /></div>
                            <span className="font-bold text-sm text-gray-300">Free Services Only</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-800 bg-gray-950/50">
                    <button onClick={onClose} className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95">Show {resultsCount} Results</button>
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 3. MAIN PAGE COMPONENT
// ----------------------------------------------------------------------

function UniversalPaymentModal({ onClose, onSuccess, planDetails }: PaymentModalProps) {
    const isMasterUpgrade = !!planDetails;

    const [step, setStep] = useState<"PLAN" | "METHOD" | "PAYING" | "SUCCESS">(
        isMasterUpgrade ? "METHOD" : "PLAN"
    );

    const [paymentMethod, setPaymentMethod] = useState<"QR" | "CARD">("QR");

    const title = isMasterUpgrade ? `Upgrade to ${planDetails?.name}` : "Unlock VIP Access";
    const price = isMasterUpgrade ? planDetails?.priceVal : 15;
    const features = isMasterUpgrade ? ["Higher Limits", "Lower GP Fee", "Premium Badge"] : ["Unlimited Copy", "AI Guard", "Golden Ticket (30 Days)"];

    const handlePay = () => { setStep("PAYING"); setTimeout(() => { setStep("SUCCESS"); setTimeout(() => { if (onSuccess) onSuccess(); }, 1500); }, 2000); };

    return (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
                <div className="p-4 flex items-center justify-between border-b border-gray-800 bg-gray-900/50 backdrop-blur z-20">
                    {step !== "PLAN" && step !== "SUCCESS" && step !== "PAYING" ? (<button onClick={() => setStep("PLAN")} className="p-2 -ml-2 text-gray-400 hover:text-white"><ChevronLeft size={20} /></button>) : <div className="w-8"></div>}
                    <h3 className="font-bold text-white">{step === "PLAN" ? "Choose Plan" : step === "METHOD" ? "Payment" : step === "PAYING" ? "Processing..." : "Success!"}</h3>
                    <button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>

                {step === "PLAN" && !isMasterUpgrade && (
                    <div className="p-5 space-y-4 overflow-y-auto">
                        <div className="text-center mb-2"><div className="w-14 h-14 bg-gradient-to-tr from-yellow-400 to-orange-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/20 rotate-3 mb-3"><Ticket size={28} className="text-black" /></div><h2 className="text-xl font-bold text-white">Golden Ticket (30 Days)</h2><p className="text-gray-400 text-xs mt-1">Unlimited Copying for 30 Days.</p></div>
                        <div className="relative group cursor-pointer rounded-2xl p-4 border transition-all hover:scale-[1.02] active:scale-95 bg-gray-800 border-yellow-500/50 shadow-lg shadow-yellow-900/10" onClick={() => setStep("METHOD")}>
                            <div className="flex justify-between items-start mb-2"><div><h3 className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-600">30-Day Pass</h3><p className="text-[10px] text-gray-400">Flexible Access</p></div><div className="text-right"><p className="text-lg font-bold text-white">$15</p><p className="text-[9px] text-gray-500">/ 30 days</p></div></div>
                            <ul className="space-y-1">{features.map((f, i) => <li key={i} className="flex items-center gap-2 text-[10px] text-gray-300"><CheckCircle2 size={12} className="text-yellow-500" /> {f}</li>)}</ul>
                        </div>
                    </div>
                )}

                {step === "METHOD" && (
                    <div className="p-6 space-y-6 animate-in slide-in-from-right">
                        <div className="bg-gray-800 p-4 rounded-xl flex justify-between items-center border border-gray-700"><div><p className="text-xs text-gray-400">Item</p><p className="font-bold text-white">{title}</p></div><p className="text-xl font-bold text-green-400">${price}</p></div>
                        <div className="space-y-3"><p className="text-xs text-gray-400 font-bold uppercase">Select Payment Method</p><button onClick={() => setPaymentMethod("QR")} className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${paymentMethod === "QR" ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500" : "bg-gray-900 border-gray-700 hover:bg-gray-800"}`}><div className="flex items-center gap-3"><div className="bg-white p-1.5 rounded"><Radio size={20} className="text-blue-900" /></div><div className="text-left"><p className="font-bold text-sm text-white">Thai QR Payment</p><p className="text-[10px] text-gray-400">Scan with any bank app</p></div></div>{paymentMethod === "QR" && <CheckCircle2 className="text-blue-500" size={18} />}</button><button onClick={() => setPaymentMethod("CARD")} className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${paymentMethod === "CARD" ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500" : "bg-gray-900 border-gray-700 hover:bg-gray-800"}`}><div className="flex items-center gap-3"><div className="bg-gray-700 p-1.5 rounded"><CreditCard size={20} className="text-white" /></div><div className="text-left"><p className="font-bold text-sm text-white">Credit / Debit Card</p><p className="text-[10px] text-gray-400">Visa, Mastercard, JCB</p></div></div>{paymentMethod === "CARD" && <CheckCircle2 className="text-blue-500" size={18} />}</button></div>
                        <button onClick={handlePay} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">Pay ${price}</button>
                    </div>
                )}

                {step === "PAYING" && (<div className="p-10 flex flex-col items-center justify-center space-y-4 animate-in fade-in h-[400px]"><div className="relative"><div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><Zap size={20} className="text-blue-500 animate-pulse" /></div></div><div className="text-center"><h3 className="text-white font-bold text-lg">Processing...</h3><p className="text-gray-500 text-xs">Confirming transaction</p></div></div>)}
                {step === "SUCCESS" && (<div className="p-10 flex flex-col items-center justify-center space-y-6 animate-in zoom-in h-[400px]"><div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/50 animate-bounce"><CheckCircle2 size={48} className="text-white" /></div><div className="text-center space-y-2"><h3 className="text-2xl font-bold text-white">Payment Success!</h3><p className="text-gray-400 text-sm">{isMasterUpgrade ? "Plan upgraded successfully." : "Golden Ticket Active!"}</p></div></div>)}
            </div>
        </div>
    );
}

function VIPUpgradeModal({ onClose, onSuccess }: VIPUpgradeModalProps) {
    return (
        <UniversalPaymentModal onClose={onClose} onSuccess={onSuccess} />
    );
}



function StopAllModal({ onClose, onConfirm, count }: StopAllModalProps) {
    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95"><div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-red-500/50 shadow-2xl relative overflow-hidden"><div className="p-8 text-center space-y-6"><div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-red-900/20 animate-bounce"><AlertOctagon size={40} className="text-red-500" /></div><div><h2 className="text-2xl font-bold text-white mb-2">Emergency Stop?</h2><p className="text-gray-400 text-sm px-2">You are about to close <span className="text-white font-bold">{count} active portfolios</span>. All open positions will be closed at market price.</p></div><div className="space-y-3"><button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-3">YES, CLOSE EVERYTHING</button><button onClick={onClose} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3.5 rounded-xl">Cancel</button></div></div></div></div>
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
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <h3 className="font-bold text-white flex items-center gap-2"><Briefcase className="text-purple-500" size={20} /> Become a Master</h3>
                    <button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="text-center">
                        <p className="text-sm text-gray-300">Choose your subscription model to start earning from followers.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div
                            onClick={() => setIsPaid(false)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${!isPaid ? 'border-green-500 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'}`}
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
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isPaid ? 'border-yellow-500 bg-yellow-900/10' : 'border-gray-700 hover:border-gray-600'}`}
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
        { id: "ROOKIE", name: "Rookie 🌱", price: "FREE", limit: "50 Followers", aum: "$50k AUM", fee: "30% GP Share", current: currentTier === "ROOKIE", newLimit: 50, newAum: 50000, priceVal: 0 },
        { id: "PRO", name: "Pro Trader 🚀", price: "$30 / mo", limit: "500 Followers", aum: "$500k AUM", fee: "20% GP Share", current: currentTier === "PRO", rec: true, newLimit: 500, newAum: 500000, priceVal: 30 },
        { id: "TYCOON", name: "Tycoon 🏢", price: "$99 / mo", limit: "Unlimited", aum: "Unlimited", fee: "10% GP Share", current: currentTier === "TYCOON", newLimit: 99999, newAum: 9999999, priceVal: 99 }
    ];

    return (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2"><TrendingUp className="text-blue-500" /> Expand Business</h3>
                    <button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="text-center space-y-2 mb-4"><p className="text-gray-400 text-xs">ร้านคุณเติบโตเร็วมาก! อัปเกรดแผนเพื่อรองรับลูกค้าเพิ่มและรับส่วนแบ่งรายได้ที่มากขึ้น</p></div>
                    <div className="space-y-3">
                        {plans.map((plan) => (
                            <div key={plan.id} className={`relative p-4 rounded-2xl border transition-all ${plan.current ? "bg-blue-900/10 border-blue-500 ring-1 ring-blue-500" : "bg-gray-800 border-gray-700 opacity-60 hover:opacity-100"}`}>
                                {plan.rec && <div className="absolute -top-2 right-4 bg-blue-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">RECOMMENDED</div>}
                                {plan.current && <div className="absolute top-4 right-4 text-blue-500"><CheckCircle2 size={18} /></div>}
                                <div className="flex justify-between items-end mb-2"><h4 className="font-bold text-lg text-white">{plan.name}</h4><span className="font-bold text-sm text-gray-300">{plan.price}</span></div>
                                <ul className="space-y-1.5"><li className="text-xs text-gray-400 flex items-center gap-2"><Users size={12} /> Max {plan.limit}</li><li className="text-xs text-gray-400 flex items-center gap-2"><Wallet size={12} /> Max {plan.aum}</li><li className="text-xs text-green-400 flex items-center gap-2 font-bold"><Zap size={12} /> {plan.fee}</li></ul>
                                {!plan.current && <button onClick={() => onSelectPlan(plan)} className="w-full mt-3 bg-white text-black font-bold py-2 rounded-lg text-xs hover:bg-gray-200">Upgrade</button>}
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
    activeSessions: Session[];
    onStopCopy: (id: number) => void;
    onStartCopy: (master: Master, amount: number, risk: number | string, sessionType: SessionType) => void;
    favorites: number[];
    walletBalance: number;
    onOpenVIP: () => void;
    isVip: boolean;
    onStopAll: () => void;
    dailyTicketUsed: boolean;
    userRole: UserRole;
    onToggleFav: (e?: React.MouseEvent, id?: number) => void;
}

function FollowerFlow({ requireAuth, onViewProfile, activeSessions, onStopCopy, onStartCopy, favorites, walletBalance, onOpenVIP, isVip, onStopAll, dailyTicketUsed, userRole, onToggleFav }: FollowerFlowProps) {
    const [activeTab, setActiveTab] = useState<"DISCOVER" | "PORTFOLIO">("DISCOVER");
    const [searchTerm, setSearchTerm] = useState("");

    // 🔍 Advanced Filter Logic
    // 🔍 Advanced Filter Logic
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({
        minProfit: 0,
        maxProfit: Infinity,
        minFee: 0,
        maxFee: Infinity,
        freeOnly: false,
        favoritesOnly: false,
        sortBy: "RECOMMENDED"
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    const [selectedMaster, setSelectedMaster] = useState<Master & { isTrial?: boolean } | null>(null);
    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [aiGuardRisk, setAiGuardRisk] = useState<number | string>(20);
    const [allocation, setAllocation] = useState<number | string>(1000);
    const [ticketTime, setTicketTime] = useState(14400); // 4 hours in seconds

    useEffect(() => {
        if (activeSessions.length > 0 && !isVip && ticketTime > 0) {
            const timer = setInterval(() => setTicketTime(t => t - 1), 1000);
            return () => clearInterval(timer);
        }
    }, [activeSessions, isVip, ticketTime]);

    const handleTabSwitch = (tab: "DISCOVER" | "PORTFOLIO") => { if (tab === "PORTFOLIO") requireAuth(() => setActiveTab("PORTFOLIO")); else setActiveTab("DISCOVER"); };

    const handleQuickCopy = (e: React.MouseEvent, master: Master) => {
        e.stopPropagation();
        if (userRole === "MASTER") { alert("👀 Spy Mode: You are viewing as a Master."); return; }

        // For quick copy, redirect to profile view to make proper selection
        onViewProfile(master);
    };

    const confirmCopy = () => {
        if (selectedMaster) {
            onStartCopy(selectedMaster, Number(allocation), aiGuardRisk, "DAILY");
            setSafetyModalOpen(false);
            setActiveTab("PORTFOLIO");
        }
    };

    const scroll = (direction: 'left' | 'right') => { if (scrollRef.current) { const amount = 200; scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' }); } };
    const formatTime = (s: number) => new Date(s * 1000).toISOString().substr(11, 8);

    const totalAllocated = activeSessions.reduce((sum, s) => sum + s.allocation, 0);
    const totalPnL = activeSessions.reduce((sum, s) => sum + (s.pnl || 0), 0);
    const totalEquity = walletBalance + totalAllocated + totalPnL;

    const filteredMasters = useMemo(() => {
        let result = mockMasters;

        // 1. Text Search
        if (searchTerm) result = result.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

        // 2. Favorites Tab (Overrides other filters if selected via tab, but here we treat it as a filter state if needed, sticking to design request layout)
        // Wait, the UI has tabs. Let's keep "Favorites" as a quick filter button outside the modal?
        // Actually, let's process the config filters:

        // Min-Max Profit (Skip if range is 0-0)
        // If user sets 0-0, it implies "Don't Filter"
        if (!(filterConfig.minProfit === 0 && filterConfig.maxProfit === 0)) {
            if (filterConfig.minProfit > 0) result = result.filter(m => m.roi >= filterConfig.minProfit);
            if (filterConfig.maxProfit > 0) result = result.filter(m => m.roi <= filterConfig.maxProfit);
        }

        // Fee Range (Skip if range is 0-0)
        if (!(filterConfig.minFee === 0 && filterConfig.maxFee === 0)) {
            result = result.filter(m => m.monthlyFee >= filterConfig.minFee && m.monthlyFee <= filterConfig.maxFee);
        }

        // Free Only
        if (filterConfig.freeOnly) result = result.filter(m => m.monthlyFee === 0);

        // Favorites Only
        if (filterConfig.favoritesOnly) result = result.filter(m => favorites.includes(m.id));

        // Sort
        if (filterConfig.sortBy === "PROFIT") result = [...result].sort((a, b) => b.roi - a.roi);
        else if (filterConfig.sortBy === "SAFE") result = [...result].sort((a, b) => a.drawdown - b.drawdown);
        else if (filterConfig.sortBy === "POPULAR") result = [...result].sort((a, b) => b.followers - a.followers);

        return result;
    }, [searchTerm, filterConfig, favorites]);

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex p-1.5 bg-gray-900 rounded-2xl mb-6 border border-gray-800 shadow-inner">
                <button onClick={() => handleTabSwitch("DISCOVER")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "DISCOVER" ? "bg-gray-800 text-white shadow" : "text-gray-500"}`}><Users size={14} /> Discover</button>
                <button onClick={() => handleTabSwitch("PORTFOLIO")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "PORTFOLIO" ? "bg-gray-800 text-white shadow" : "text-gray-500"}`}><Layers size={14} /> Portfolio {activeSessions.length > 0 && <span className="bg-green-500 text-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{activeSessions.length}</span>}</button>
            </div>

            {activeTab === "DISCOVER" ? (
                <div className="space-y-6 pb-20">
                    {isVip ? (
                        <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border border-yellow-500/30 p-3 rounded-xl flex items-center justify-between"><div className="flex items-center gap-2"><Crown className="text-yellow-400" size={16} /><div><p className="font-bold text-xs text-yellow-100">VIP Access</p><p className="text-[10px] text-yellow-500/80">Unlimited Time & Tech</p></div></div><span className="text-[10px] font-bold bg-yellow-500 text-black px-2 py-0.5 rounded">Lifetime</span></div>
                    ) : (
                        dailyTicketUsed && activeSessions.length === 0 ? (
                            <div className="bg-red-900/20 border border-red-500/20 p-3 rounded-xl flex items-center justify-between"><div className="flex items-center gap-2"><Moon className="text-red-400" size={16} /><div><p className="font-bold text-xs text-red-100">Daily Quota Used</p><p className="text-[10px] text-red-400">Reset: 04:00 AM</p></div></div><button onClick={onOpenVIP} className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded">Unlock</button></div>
                        ) : (
                            <div className="bg-blue-900/20 border border-blue-500/20 p-3 rounded-xl flex items-center justify-between"><div className="flex items-center gap-2"><Zap className="text-blue-400" size={16} /><div><p className="font-bold text-xs text-blue-100">Free Daily Pass</p><p className="text-[10px] text-blue-400">4 Hours / Real Acc Only</p></div></div><button onClick={onOpenVIP} className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded">Unlock 24h</button></div>
                        )
                    )}

                    <div className="sticky top-20 bg-gray-950/95 backdrop-blur py-2 z-20 space-y-3">
                        <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-500" size={16} /><input type="text" placeholder="Search Masters..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-blue-500 text-white" /></div>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                            <button onClick={() => setShowFilterModal(true)} className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${showFilterModal || filterConfig.sortBy !== "RECOMMENDED" ? "bg-white text-black border-white shadow-lg" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}>
                                <SlidersHorizontal size={12} /> {filterConfig.sortBy === "RECOMMENDED" ? "Filters" : filterConfig.sortBy}
                            </button>

                            {/* Quick Filter: Free */}
                            <button onClick={() => setFilterConfig(prev => ({ ...prev, freeOnly: !prev.freeOnly }))} className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${filterConfig.freeOnly ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-gray-900 text-gray-400 border-gray-700"}`}>
                                {filterConfig.freeOnly ? "Free Only ✓" : "Free"}
                            </button>

                            {/* Quick Filter: Favorites (Separated Logic for simple toggle) */}
                            <button onClick={() => setFilterConfig(prev => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))} className={`px-4 py-2 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${filterConfig.favoritesOnly ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}>
                                {filterConfig.favoritesOnly ? "Favorites Only ❤️" : "Favorites"}
                            </button>
                        </div>
                    </div>

                    {/* Rendering Filter Modal */}
                    {showFilterModal && <FilterModal config={filterConfig} setConfig={setFilterConfig} onClose={() => setShowFilterModal(false)} resultsCount={filteredMasters.length} />}

                    {!searchTerm && filterConfig.sortBy === "RECOMMENDED" && !filterConfig.freeOnly && (
                        <div className="space-y-2 relative group/scroll">
                            <div className="flex justify-between items-center px-1"><h3 className="font-bold text-sm text-gray-200">Recommended</h3><div className="flex gap-2"><button onClick={() => scroll('left')} className="hidden md:flex w-6 h-6 bg-gray-800 rounded-full items-center justify-center hover:bg-white hover:text-black transition-colors"><ChevronLeft size={14} /></button><button onClick={() => scroll('right')} className="hidden md:flex w-6 h-6 bg-gray-800 rounded-full items-center justify-center hover:bg-white hover:text-black transition-colors"><ChevronRight size={14} /></button></div></div>
                            <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar scroll-smooth px-1">
                                {mockMasters.slice(0, 5).map((master) => (
                                    <div key={master.id} onClick={() => onViewProfile(master)} className="snap-center min-w-[140px] w-[140px] bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden group hover:border-gray-600 transition-all cursor-pointer">
                                        <div onClick={(e) => onToggleFav(e, master.id)} className="absolute top-2 right-2 z-10 p-2 -mr-2 -mt-2 hover:scale-110 transition-transform active:scale-90 cursor-pointer">{favorites.includes(master.id) ? <Heart size={14} className="text-red-500 fill-red-500" /> : <Heart size={14} className="text-gray-600 hover:text-red-400" />}</div>
                                        <div className="absolute top-2 left-2">{master.monthlyFee > 0 ? <span className="bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"><Lock size={8} /> ${master.monthlyFee}</span> : <span className="bg-green-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded">FREE</span>}</div>
                                        <div className="text-center mt-4 mb-3">
                                            <div className="relative inline-block"><img src={master.avatar} alt={master.name} className="w-12 h-12 rounded-full border-2 border-gray-700 mx-auto mb-2" />{master.isVip && <div className="absolute bottom-0 right-0 bg-yellow-500 text-black text-[8px] px-1 rounded-full font-bold">PRO</div>}</div>
                                            <h4 className="font-bold text-xs leading-tight line-clamp-1 mb-1">{master.name}</h4>
                                            <p className={`text-xs font-bold ${master.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>+{master.roi}%</p>
                                            <p className="text-[9px] text-blue-400 font-bold mt-1">{master.followers.toLocaleString()} Investors</p>
                                        </div>
                                        <button onClick={(e) => handleQuickCopy(e, master)} disabled={userRole === "MASTER"} className={`w-full text-[10px] font-bold py-2 rounded-lg transition-colors ${activeSessions.some((s) => s.master.id === master.id) ? "bg-red-500 text-white" : userRole === "MASTER" ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200"}`}>{userRole === "MASTER" ? "Master View" : activeSessions.some((s) => s.master.id === master.id) ? "Uncopy" : "Copy"}</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3 pt-2 border-t border-gray-800">
                        <h3 className="font-bold text-sm text-gray-400">All Masters ({filteredMasters.length})</h3>
                        {filteredMasters.length === 0 ? <p className="text-center text-gray-500 text-xs py-10">No masters found.</p> :
                            filteredMasters.map((master) => (
                                <div key={master.id} onClick={() => onViewProfile(master)} className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-3 border border-gray-800 relative hover:bg-gray-800 transition-colors cursor-pointer flex gap-3 items-center">
                                    <img src={master.avatar} alt={master.name} className="w-12 h-12 rounded-xl" />
                                    <div className="flex-1 min-w-0"><div className="flex justify-between items-center"><h3 className="font-bold text-sm truncate flex items-center gap-1">{master.name} <div onClick={(e) => onToggleFav(e, master.id)} className="cursor-pointer p-1 hover:scale-110 active:scale-90 transition-transform">{favorites.includes(master.id) ? <Heart size={14} className="text-red-500 fill-red-500" /> : <Heart size={14} className="text-gray-600 hover:text-red-400" />}</div></h3><span className={`text-xs font-bold ${master.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>+{master.roi}%</span></div><div className="flex justify-between items-center mt-1"><div className="flex gap-1 text-[9px] text-gray-400 overflow-hidden">{master.tags.slice(0, 2).map((t, i) => <span key={i} className="bg-gray-800 px-1.5 py-0.5 rounded whitespace-nowrap">{t}</span>)} <span className="text-blue-400 font-bold flex items-center gap-0.5"><Users size={10} /> {master.followers.toLocaleString()}</span></div>{master.monthlyFee > 0 ? <span className="text-[10px] text-yellow-500 font-bold">${master.monthlyFee}/mo</span> : <span className="text-[10px] text-green-500 font-bold">Free</span>}</div></div>
                                    <button onClick={(e) => handleQuickCopy(e, master)} disabled={userRole === "MASTER"} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg shadow shrink-0 ${activeSessions.some((s) => s.master.id === master.id) ? "bg-red-500 text-white hover:bg-red-600" : userRole === "MASTER" ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200"}`}>{userRole === "MASTER" ? "Master View" : activeSessions.some((s) => s.master.id === master.id) ? "Stop" : "Copy"}</button>
                                </div>
                            ))
                        }
                    </div>
                </div>
            ) : (
                // 📊 PORTFOLIO VIEW
                <div className="space-y-6 animate-in slide-in-from-right">
                    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-4">
                        <div className="flex justify-between items-end">
                            <div><p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Total Equity</p><h2 className="text-3xl font-bold font-mono text-white">${totalEquity.toLocaleString()}</h2></div>
                            <div className="text-right"><p className="text-[10px] text-gray-400 uppercase font-bold">Unrealized PnL</p><p className={`text-lg font-bold font-mono ${totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>{totalPnL >= 0 ? "+" : ""}{totalPnL.toFixed(2)}</p></div>
                        </div>
                        <div className="space-y-1"><div className="flex justify-between text-[9px] font-bold"><span className="text-gray-400">Available: <span className="text-white">${walletBalance.toLocaleString()}</span></span><span className="text-gray-400">Allocated: <span className="text-blue-400">${totalAllocated.toLocaleString()}</span></span></div><div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex"><div className="h-full bg-blue-500" style={{ width: `${(totalAllocated / totalEquity) * 100}%` }}></div><div className="h-full bg-green-500" style={{ width: `${(walletBalance / totalEquity) * 100}%` }}></div></div></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase mb-1">Active Masters</p><div className="flex items-center gap-2"><Users size={16} className="text-blue-400" /><span className="font-bold text-sm text-white">{activeSessions.length} {isVip ? "/ ∞" : "/ 1"}</span></div></div>
                        <div className="bg-gray-900 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase mb-1">Time Remaining</p><div className="flex items-center gap-2"><Clock size={16} className={isVip ? "text-yellow-400" : "text-green-400"} /><span className="font-bold text-sm text-white">{isVip ? "Unlimited" : formatTime(ticketTime)}</span></div></div>
                    </div>

                    <div className="space-y-4 pb-24">
                        <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide">Active Portfolios</h3>
                        {activeSessions.length === 0 ? (<div className="text-center py-10 text-gray-500 space-y-2 border border-dashed border-gray-800 rounded-2xl"><Briefcase className="mx-auto opacity-50" size={40} /><p className="text-xs">No active copies.</p></div>) : (
                            activeSessions.map((session) => (
                                <ActiveSessionWidget key={session.id} master={session.master} time={ticketTime} risk={session.risk} allocation={session.allocation} onStop={() => onStopCopy(session.master.id)} isVip={isVip} session={session} />

                            ))
                        )}
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

            {safetyModalOpen && selectedMaster && <SafetyGuardModal risk={aiGuardRisk} setRisk={setAiGuardRisk} allocation={allocation} setAllocation={setAllocation} onClose={() => setSafetyModalOpen(false)} onConfirm={confirmCopy} maxAlloc={walletBalance} />}
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
    onOpenWallet: () => void;
    onBecomeMaster: () => void;
}

function MasterFlow({ onOpenSettings, onViewFollower, userRole, profile, setProfile, onOpenWallet, onBecomeMaster }: MasterFlowProps) {
    const [showUpgradeMaster, setShowUpgradeMaster] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [viewMyProfile, setViewMyProfile] = useState(false);

    // Calculate Capacity
    const followerPercent = (profile.followersCount / profile.followersLimit) * 100;
    const aumPercent = (profile.aum / profile.aumLimit) * 100;
    const isCritical = followerPercent >= 90 || aumPercent >= 90;

    const handleSelectPlan = (plan: any) => {
        setSelectedPlan(plan);
        setShowUpgradeMaster(false);
        setPaymentModalOpen(true);
    }

    const handleUpgradeSuccess = () => {
        setPaymentModalOpen(false);
        if (selectedPlan) {
            // 🎉 Simulate Magic Upgrade
            setProfile({
                ...profile,
                tier: selectedPlan.id,
                followersLimit: selectedPlan.newLimit,
                aumLimit: selectedPlan.newAum
            });
            toast.success("Upgrade Successful! 🎉", { description: `You are now a ${selectedPlan.name}. Limits increased!` });
        }
    }

    // Construct a Master object from the profile to preview
    const myMasterData: Master = {
        id: 9999,
        name: profile.name,
        type: "HUMAN",
        winRate: 0,
        roi: 0,
        pnlText: "$0",
        followers: profile.followersCount,
        balance: 0,
        risk: 0,
        drawdown: 0,
        profitFactor: 0,
        avatar: profile.avatar,
        isVip: true,
        desc: profile.desc,
        tags: profile.tags,
        joined: "2023",
        currentOrders: [],
        monthlyFee: profile.monthlyFee,
        isPremium: profile.monthlyFee > 0
    };

    if (viewMyProfile) {
        return (
            <MasterProfileView
                master={myMasterData}
                onBack={() => setViewMyProfile(false)}
                requireAuth={() => { }} // No auth needed for preview
                onStartCopy={() => alert("You cannot copy yourself!")}
                onStopCopy={() => { }}
                isPreview={true}
            />
        )
    }

    return (
        <div className="animate-in slide-in-from-right-4 space-y-6 pb-20">

            {/* 🚨 Capacity Alert (Only for Master) */}
            {userRole === "MASTER" && isCritical && (
                <div onClick={() => setShowUpgradeMaster(true)} className="bg-gradient-to-r from-orange-500 to-red-600 p-4 rounded-2xl shadow-lg shadow-orange-900/20 cursor-pointer relative overflow-hidden group">
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
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-800 p-3 rounded-2xl flex items-center justify-between shadow-lg">
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
                                <p className="text-[10px] text-gray-500">Broadcasting trades to followers...</p>
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
                onClick={() => setViewMyProfile(true)}
                className="bg-gray-900 rounded-2xl p-5 border border-gray-800 relative overflow-hidden cursor-pointer hover:border-gray-600 transition-colors group"
            >
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${userRole === "MASTER" ? "from-purple-500 to-indigo-600" : "from-gray-700 to-gray-600"}`}></div>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center font-bold text-xl border-4 border-gray-900 shadow-xl relative z-10">MK</div>
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2 group-hover:text-purple-300 transition-colors">
                            {profile.name} {userRole === "MASTER" && <BadgeCheck size={16} className="text-blue-400" fill="currentColor" color="black" />}
                        </h2>
                        {userRole === "MASTER" ? (
                            <span className="bg-purple-900/30 text-purple-400 text-[9px] font-bold px-2 py-0.5 rounded border border-purple-500/30">TIER: {profile.tier}</span>
                        ) : (
                            <span className="bg-gray-800 text-gray-500 text-[9px] font-bold px-2 py-0.5 rounded border border-gray-700">DRAFT MODE</span>
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
                                <span>Followers Usage</span>
                                <span className={followerPercent >= 90 ? "text-red-400" : "text-white"}>{profile.followersCount} / {profile.followersLimit}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${followerPercent >= 90 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${followerPercent}%` }}></div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                <span>AUM (Total Equity)</span>
                                <span className={aumPercent >= 90 ? "text-red-400" : "text-white"}>${profile.aum.toLocaleString()} / ${profile.aumLimit.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${aumPercent >= 90 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${aumPercent}%` }}></div>
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

                <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                    <div className="bg-black/30 p-3 rounded-xl"><p className="text-[10px] text-gray-500 uppercase">Followers</p><p className="text-xl font-bold font-mono text-white">{userRole === "MASTER" ? profile.followersCount : "-"}</p></div>
                    <div
                        onClick={userRole === "MASTER" ? onOpenWallet : undefined}
                        className={`relative overflow-hidden group p-3 rounded-xl transition-all duration-300 ${userRole === "MASTER" ? "cursor-pointer bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-green-500/50 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]" : "bg-black/30"}`}
                    >
                        <p className="text-[10px] text-gray-500 uppercase flex items-center justify-center gap-1.5 mb-1 group-hover:text-green-400 transition-colors">
                            <Wallet size={12} className={userRole === "MASTER" ? "group-hover:rotate-12 transition-transform" : ""} />
                            GP Earned
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            <p className={`text-xl font-bold font-mono ${userRole === "MASTER" ? "text-green-400 group-hover:text-green-300 group-hover:scale-105 transition-all" : "text-gray-500"}`}>
                                {userRole === "MASTER" ? "$75.00" : "$0.00"}
                            </p>
                            {userRole === "MASTER" && <ChevronRight size={14} className="text-gray-600 group-hover:text-white group-hover:translate-x-1 transition-transform" />}
                        </div>
                    </div>
                </div>
            </div>

            <div onClick={onOpenSettings} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors group">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-900/20 p-2.5 rounded-lg border border-purple-500/20"><Edit3 className="text-purple-400" size={20} /></div>
                    <div><p className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">Edit Public Profile</p><p className="text-[10px] text-gray-500">Manage Bio, Tags & Avatar</p></div>
                </div>
                <ChevronRight className="text-gray-600 group-hover:text-white" size={18} />
            </div>

            {/* 2. Recent Followers */}
            {userRole === "MASTER" ? (
                <div className="space-y-3">
                    <div className="flex justify-between items-center px-1"><h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide">Recent Followers</h3><span className="text-[10px] text-purple-400 cursor-pointer">View All</span></div>
                    {mockFollowersList.map((follower) => (
                        <div key={follower.id} onClick={() => onViewFollower(follower)} className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex justify-between items-center hover:bg-gray-800 transition-colors cursor-pointer">
                            <div className="flex items-center gap-3"><img src={follower.avatar} alt={follower.name} className="w-10 h-10 rounded-full bg-gray-800" /><div><p className="font-bold text-sm text-white">{follower.name}</p><p className="text-[10px] text-gray-500">Joined {follower.joined}</p></div></div>
                            <div className="text-right"><p className={`font-mono font-bold text-sm ${follower.pnl.includes('+') ? 'text-green-400' : 'text-red-400'}`}>{follower.pnl}</p><p className="text-[9px] text-gray-500">PnL</p></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="relative overflow-hidden rounded-2xl p-1 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-800">
                    <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:16px_16px]"></div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full point-events-none"></div>

                    <div className="relative bg-gray-950/80 backdrop-blur-xl rounded-xl p-8 text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-purple-600 to-blue-600 rounded-full p-[2px] shadow-lg shadow-purple-900/40 animate-pulse">
                            <div className="w-full h-full bg-gray-950 rounded-full flex items-center justify-center">
                                <Briefcase className="text-white" size={28} />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xl font-bold text-white mb-1">Ready to Launch? 🚀</h3>
                            <p className="text-xs text-gray-400 max-w-[200px] mx-auto">Activate Master Mode to start publishing your signals and earning monthly income.</p>
                        </div>

                        <button
                            onClick={onBecomeMaster}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group"
                        >
                            <span>Activate Master Mode</span>
                            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
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
                <div className="grid grid-cols-2 gap-3"><div className="bg-gray-900 p-4 rounded-2xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase">Equity</p><p className="text-xl font-bold text-white">${follower.equity}</p></div><div className="bg-gray-900 p-4 rounded-2xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase">Profit Made</p><p className={`text-xl font-bold ${follower.pnl.includes('+') ? 'text-green-400' : 'text-red-400'}`}>{follower.pnl}</p></div></div>
                <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl text-left"><p className="text-xs text-gray-500 text-center">View-only mode. Privacy protected.</p></div>
            </div>
        </div>
    )
}

// ----------------------------------------------------------------------
// 4. MASTER WALLET COMPONENTS (Mooved to @/features/wallet)
// ----------------------------------------------------------------------


// ----------------------------------------------------------------------
// 📦 MAIN APP COMPONENT (Moved to BOTTOM)
// ----------------------------------------------------------------------
export default function BridgeTradeApp() {

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isUserVip, setIsUserVip] = useState(false);
    const [viewMode, setViewMode] = useState<UserRole>("FOLLOWER");
    const [userRole, setUserRole] = useState<UserRole>("FOLLOWER");
    const [accountStatus, setAccountStatus] = useState<AccountStatus>("CONNECTED");
    const [walletBalance, setWalletBalance] = useState(INITIAL_BALANCE);
    const [activeSessions, setActiveSessions] = useState<Session[]>([]);
    const [favorites, setFavorites] = useState<number[]>([]);
    const [dailyTicketUsed, setDailyTicketUsed] = useState(false);
    const [masterProfile, setMasterProfile] = useState<MasterProfile>(CURRENT_USER_DATA.masterProfile);
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [goldenTickets, setGoldenTickets] = useState(1);
    const [goldenTicketExpiry, setGoldenTicketExpiry] = useState<number>(0);
    const [goldenTicketStart, setGoldenTicketStart] = useState<number>(0);
    const [hasUsed7DayTrial, setHasUsed7DayTrial] = useState(false);

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
    const [masterTransactions, setMasterTransactions] = useState<Transaction[]>([
        { id: "tx_1", type: "EARNING", title: "Sub: Alice Wonderland", amount: 25, date: Date.now() - (35 * 86400000), status: "AVAILABLE" },
        { id: "tx_2", type: "EARNING", title: "Sub: Somchai Trader", amount: 25, date: Date.now() - (2 * 86400000), status: "LOCKED", releaseDate: Date.now() + (28 * 86400000) },
        { id: "tx_3", type: "WITHDRAWAL", title: "Withdraw to KBank", amount: -150, date: Date.now() - (1 * 3600000), status: "PENDING", meta: { bank: "KBank", account: "123-456-7890", name: "John Doe" } }
    ]);

    const handleWithdrawal = (amount: number, bankDetails: any = {}) => {
        const newTx: Transaction = {
            id: `tx_${Date.now()}`,
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
    // Check if golden ticket is active
    const isGoldenActive = goldenTicketExpiry > Date.now();

    // Modals
    const [showSettings, setShowSettings] = useState(false);
    const [showVIP, setShowVIP] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [showStopAll, setShowStopAll] = useState(false);
    const [viewingProfile, setViewingProfile] = useState<Master | null>(null);
    const [viewingFollower, setViewingFollower] = useState<any | null>(null);
    const [startOnBroker, setStartOnBroker] = useState(false);

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

    const handleToggleFavorite = (e?: React.MouseEvent, masterId?: number) => {
        if (e) e.stopPropagation();
        const idToToggle = masterId;

        requireAuth(() => {
            if (!idToToggle) return;
            if (favorites.includes(idToToggle)) {
                setFavorites(prev => prev.filter(fid => fid !== idToToggle));
                toast.success("Removed from Favorites");
            } else {
                setFavorites(prev => [...prev, idToToggle]);
                toast.success("Added to Favorites ❤️");
            }
        });
    };

    const startCopying = (master: Master, amount: number, risk: number | string, sessionType: SessionType) => {
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
        const isUnlimitedUser = isUserVip || sessionType === "GOLDEN";
        if (!isUnlimitedUser && activeSessions.length >= 1) {
            openGlobalModal(
                "🚫 Limit Reached (1 Master Max)",
                "You are on a Free/Trial plan. You can only follow 1 Master at a time.\n\nUpgrade to VIP for Unlimited Copying!",
                () => setShowVIP(true),
                "warning"
            );
            return;
        }

        // 🛡️ 3. CHECK: DAILY PASS QUOTA
        if (sessionType === "DAILY") {
            if (dailyTicketUsed) {
                openGlobalModal(
                    "🚫 Daily Pass Expired",
                    "Daily Pass used for today. Wait for tomorrow or Upgrade to VIP.",
                    () => setShowVIP(true),
                    "warning"
                );
                return;
            }
        }

        if (amount > walletBalance) {
            openGlobalModal("Insufficient Balance", "Please top up your wallet to continue.", () => { });
            return;
        }

        // Calculate Expiry
        let expiry: number | null = null;
        if (sessionType === "TRIAL_7DAY") expiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
        else if (sessionType === "GOLDEN") expiry = goldenTicketExpiry; // Sync with user's golden pass

        const newSession: Session = {
            id: Date.now(),
            master: master,
            allocation: amount,
            risk: risk,
            startTime: Date.now(),
            pnl: 0,
            orders: master.currentOrders,
            isTrial: sessionType === "TRIAL_7DAY" || sessionType === "GOLDEN",
            type: sessionType,
            expiry: expiry
        };

        setActiveSessions([...activeSessions, newSession]);
        setWalletBalance(prev => prev - amount);

        // Update State based on Type
        if (sessionType === "GOLDEN") {
            if (goldenTicketExpiry <= Date.now() && goldenTickets > 0) {
                setGoldenTickets(prev => prev - 1);
                setGoldenTicketExpiry(Date.now() + (30 * 24 * 60 * 60 * 1000));
                toast.success("Golden Ticket Activated!", { description: "You have 30 days of unlimited access." });
            } else {
                toast.success("Master Added", { description: "Added to your Golden Pass portfolio." });
            }
        } else if (sessionType === "TRIAL_7DAY") {
            setHasUsed7DayTrial(true);
            toast.success("7-Day Free Trial Started!", { description: "Use it wisely. Copying active." });
        } else if (sessionType === "DAILY") {
            setDailyTicketUsed(true);
        }
    };

    const stopCopying = (masterId: number) => {
        const session = activeSessions.find(s => s.master.id === masterId);
        if (session) {
            let warning = `Stop copying ${session.master.name}?`;
            let modalType: "warning" | "danger" | "info" = "danger";

            if (session.type === "TRIAL_7DAY") {
                warning = `⚠️ Warning: Stopping this 7-Day Trial will forfeit the remaining days.\nYou cannot use this offer again.\n\nConfirm Stop?`;
                modalType = "warning";
            } else if (session.type === "DAILY") {
                warning = `⚠️ Warning: Stopping this Daily Pass will use up your quota for today.\n\nConfirm Stop?`;
                modalType = "warning";
            }

            openGlobalModal(
                "Stop Copying?",
                warning,
                () => {
                    setWalletBalance(prev => prev + session.allocation + (session.pnl || 0));
                    setActiveSessions(prev => prev.filter(s => s.master.id !== masterId));
                    setGlobalModal(p => ({ ...p, isOpen: false }));
                },
                modalType
            );
        }
    };

    const confirmStopAll = () => {
        let totalReturn = 0; activeSessions.forEach(s => { totalReturn += s.allocation + (s.pnl || 0); });
        setWalletBalance(prev => prev + totalReturn); setActiveSessions([]); setShowStopAll(false);
    };

    const confirmActivation = (fee: number) => {
        setMasterProfile(prev => ({ ...prev, monthlyFee: fee }));
        setUserRole("MASTER");
        setViewMode("MASTER");
        setShowActivationModal(false);
        toast.success("Welcome, Master!", { description: `Your subscription fee is set to $${fee}/month.` });
    };

    const handleBecomeMasterRequest = () => {
        if (accountStatus !== "CONNECTED") {
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Trading Account first." });
            setStartOnBroker(true);
            setShowSettings(true);
            return;
        }
        setShowSettings(true);
        setTimeout(() => setShowActivationModal(true), 300);
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        setViewMode("FOLLOWER");
        setShowSettings(false);
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans pb-24 selection:bg-green-500 selection:text-black">
            <style jsx global>{` .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } `}</style>

            <Navbar
                viewMode={viewMode} onSwitch={handleSwitchView}
                wallet={walletBalance} status={accountStatus}
                isLoggedIn={isLoggedIn} isVip={isUserVip}
                goldenTickets={goldenTickets}
                goldenTicketExpiry={goldenTicketExpiry}
                goldenTicketStart={goldenTicketStart}
                onOpenSettings={() => requireAuth(() => setShowSettings(true))}
                onOpenVIP={() => requireAuth(() => setShowVIP(true))}
                onLogin={() => setShowLogin(true)}
                onBecomeMaster={userRole === "FOLLOWER" ? () => requireAuth(handleBecomeMasterRequest) : undefined}
            />

            <div className="pt-24 px-4 max-w-md mx-auto">
                {isLoggedIn && accountStatus === "ERROR" && <div onClick={() => setShowSettings(true)} className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl mb-4 flex items-center justify-between animate-pulse cursor-pointer"><div className="flex items-center gap-3"><AlertTriangle className="text-red-500" /><div><p className="font-bold text-sm text-red-400">Connection Error</p><p className="text-[10px] text-gray-400">Tap to reconnect.</p></div></div><span className="text-xs font-bold text-red-500 underline">Fix</span></div>}

                {userRole === "MASTER" && viewMode === "FOLLOWER" && (
                    <div className="mb-4 bg-purple-900/30 border border-purple-500/50 p-3 rounded-xl flex items-center gap-3">
                        <Eye className="text-purple-400" size={20} />
                        <div><p className="text-xs font-bold text-purple-200">Spy Mode Active</p><p className="text-[10px] text-purple-400/80">You are viewing competitors. Copying is disabled.</p></div>
                    </div>
                )}

                {viewMode === "FOLLOWER" ? (
                    viewingProfile ? (
                        <MasterProfileView
                            master={viewingProfile} onBack={() => setViewingProfile(null)} requireAuth={requireAuth}
                            isFav={favorites.includes(viewingProfile.id)} onToggleFav={() => handleToggleFavorite(undefined, viewingProfile.id)}
                            onStartCopy={startCopying} onStopCopy={stopCopying} isCopying={activeSessions.some(s => s.master.id === viewingProfile.id)}
                            maxAlloc={walletBalance} isVip={isUserVip}
                            userRole={userRole} onOpenVIP={() => requireAuth(() => setShowVIP(true))}
                            goldenTickets={goldenTickets}
                            isGoldenActive={goldenTicketExpiry > Date.now()}
                            hasUsed7DayTrial={hasUsed7DayTrial}
                            accountStatus={accountStatus}
                            onOpenSettings={() => requireAuth(() => { setStartOnBroker(true); setShowSettings(true); })}
                        />
                    ) : (
                        <FollowerFlow
                            requireAuth={requireAuth} onViewProfile={setViewingProfile}
                            activeSessions={activeSessions} onStopCopy={stopCopying} onStartCopy={startCopying}
                            favorites={favorites} walletBalance={walletBalance}
                            onOpenVIP={() => requireAuth(() => setShowVIP(true))}
                            isVip={isUserVip} onStopAll={() => setShowStopAll(true)}
                            dailyTicketUsed={dailyTicketUsed}
                            userRole={userRole}
                            onToggleFav={handleToggleFavorite}
                        />
                    )
                ) : (
                    viewingFollower ?
                        <FollowerDetailView follower={viewingFollower} onBack={() => setViewingFollower(null)} />
                        :
                        <MasterFlow
                            onOpenSettings={() => setShowSettings(true)}
                            onViewFollower={setViewingFollower}
                            userRole={userRole}
                            profile={masterProfile}
                            setProfile={setMasterProfile}
                            onOpenWallet={() => setShowWallet(true)}
                            onBecomeMaster={handleBecomeMasterRequest}
                        />
                )}
            </div>

            {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setStartOnBroker(false); }} status={accountStatus} setStatus={setAccountStatus} role={userRole} setRole={setUserRole} setViewMode={setViewMode} onLogout={handleLogout} isVip={isUserVip} setIsVip={setIsUserVip} activeSessions={activeSessions} onStopAll={() => setShowStopAll(true)} profile={masterProfile} setProfile={setMasterProfile} onRequestActivation={() => setShowActivationModal(true)} openConfirm={openGlobalModal} defaultShowBroker={startOnBroker} />}

            {showActivationModal && <MasterActivationModal onClose={() => setShowActivationModal(false)} onConfirm={confirmActivation} />}

            {showVIP && (
                <VIPUpgradeModal
                    onClose={() => setShowVIP(false)}
                    onSuccess={() => {
                        setIsUserVip(true);
                        setGoldenTicketExpiry(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 Days
                        setGoldenTicketStart(Date.now()); // 🕒 Start Date
                        setShowVIP(false);
                        setDailyTicketUsed(false);
                        toast.success("Welcome to VIP Club! 🌟", { description: "Unlimited Access Unlocked." });
                    }}
                />
            )}

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
            <Toaster />
        </div>
    );
}
