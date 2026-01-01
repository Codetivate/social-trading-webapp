import { useState } from "react";
import { Wallet, X, DollarSign, CheckCircle2, Lock, Info, Clock, ArrowRight, ArrowUpRight, ArrowDownLeft, Filter, AlertCircle } from "lucide-react";
import { Transaction } from "../types";
import { BankWithdrawalModal } from "./BankWithdrawalModal";
import { toast } from "sonner";

interface MasterWalletModalProps {
    onClose: () => void;
    balance: number;
    transactions: Transaction[];
    onWithdraw: (amount: number) => void;
    savedBank: { id: string, name: string, account: string, bank: string } | null;
    onSaveBank: (bank: any) => void;
    onCancelWithdrawal?: (id: string) => void; // New prop for cancelling
}

export function MasterWalletModal({ onClose, balance, transactions, onWithdraw, savedBank, onSaveBank, onCancelWithdrawal }: MasterWalletModalProps) {
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [activeTab, setActiveTab] = useState<"ALL" | "EARNINGS" | "WITHDRAWALS">("ALL");

    // 🧮 Calculate Balances (Only from EARNINGS that are available, minus COMPLETED/PENDING withdrawals if not already accounted)
    // For simplicity in this demo, we assume 'transactions' source of truth is correct
    const lockedBalance = transactions.filter(t => t.type === "EARNING" && t.status === "LOCKED").reduce((sum, t) => sum + t.amount, 0);
    const totalEarnings = transactions.filter(t => t.type === "EARNING" && t.status === "AVAILABLE").reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawn = transactions.filter(t => t.type === "WITHDRAWAL" && (t.status === "COMPLETED" || t.status === "PENDING")).reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Available = Total Earnings - Total Withdrawn
    const availableBalance = totalEarnings - totalWithdrawn;

    const filteredTransactions = transactions.filter(t => {
        if (activeTab === "ALL") return true;
        if (activeTab === "EARNINGS") return t.type === "EARNING";
        if (activeTab === "WITHDRAWALS") return t.type === "WITHDRAWAL";
        return true;
    }).sort((a, b) => b.date - a.date);

    return (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-10">
            <div className="bg-gray-900 w-full max-w-md rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <h3 className="font-bold text-white flex items-center gap-2"><Wallet className="text-blue-500" /> Master Wallet</h3>
                    <button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>
                </div>

                <div className="overflow-y-auto">
                    {/* 💳 Balance Card */}
                    <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 m-4 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80} className="text-white" /></div>

                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Available to Withdraw</p>
                        <h2 className="text-4xl font-bold text-white font-mono mb-6">${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-green-500 font-bold uppercase flex items-center gap-1"><CheckCircle2 size={10} /> Lifetime Earnings</p>
                                <p className="text-xl font-bold text-white font-mono opacity-80">${totalEarnings.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-yellow-500 font-bold uppercase flex items-center gap-1"><Lock size={10} /> Pending (Escrow)</p>
                                <p className="text-xl font-bold text-white font-mono opacity-80">${lockedBalance.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* 💸 Action Bar */}
                    <div className="px-6 pb-6">
                        <button
                            onClick={() => setShowWithdrawModal(true)}
                            disabled={availableBalance < 10}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-between px-6 shadow-lg shadow-blue-900/20 group"
                        >
                            <span className="group-hover:translate-x-1 transition-transform">Withdraw Funds</span>
                            <div className="bg-white/20 p-1.5 rounded-full"><ArrowRight size={18} /></div>
                        </button>
                    </div>

                    {/* 📜 History Section */}
                    <div className="bg-gray-950/50 flex-1 border-t border-gray-800">
                        {/* Tabs */}
                        <div className="flex border-b border-gray-800 sticky top-0 bg-gray-900/95 backdrop-blur z-10">
                            {[
                                { id: "ALL", label: "All Activity" },
                                { id: "EARNINGS", label: "Earnings" },
                                { id: "WITHDRAWALS", label: "Withdrawals" }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex-1 py-4 text-xs font-bold transition-colors border-b-2 ${activeTab === tab.id ? "text-blue-400 border-blue-400 bg-blue-500/5" : "text-gray-500 border-transparent hover:text-gray-300"}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* List */}
                        <div className="p-4 space-y-3 min-h-[300px]">
                            {filteredTransactions.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <Clock className="mx-auto mb-2" size={24} />
                                    <p className="text-xs">No transactions found.</p>
                                </div>
                            ) : (
                                filteredTransactions.map((t) => (
                                    <div key={t.id} className="group flex justify-between items-start p-3 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
                                        <div className="flex gap-3">
                                            {/* Icon */}
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${t.type === "WITHDRAWAL"
                                                ? "bg-red-500/10 text-red-500"
                                                : t.status === "LOCKED" ? "bg-yellow-500/10 text-yellow-500" : "bg-green-500/10 text-green-500"
                                                }`}>
                                                {t.type === "WITHDRAWAL" ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                            </div>

                                            {/* Info */}
                                            <div>
                                                <p className="text-sm font-bold text-white">{t.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-gray-500">{new Date(t.date).toLocaleDateString()}</span>

                                                    {/* Status Badge */}
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${getStatusStyle(t.status)}`}>
                                                        {t.status.replace("_", " ")}
                                                    </span>
                                                </div>

                                                {/* Meta Info */}
                                                {t.status === "LOCKED" && t.releaseDate && (
                                                    <p className="text-[10px] text-yellow-500/80 mt-1 flex items-center gap-1">
                                                        <Lock size={10} /> Unlocks: {new Date(t.releaseDate).toLocaleDateString()}
                                                    </p>
                                                )}
                                                {t.type === "WITHDRAWAL" && t.meta?.bank && (
                                                    <p className="text-[10px] text-gray-400 mt-1">
                                                        {t.meta.bank} •• {t.meta.account.slice(-4)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Side */}
                                        <div className="text-right">
                                            <p className={`font-mono font-bold ${t.type === "WITHDRAWAL" ? "text-white" : "text-green-400"}`}>
                                                {t.type === "WITHDRAWAL" ? "-" : "+"}${Math.abs(t.amount).toLocaleString()}
                                            </p>

                                            {/* Cancel Action */}
                                            {t.status === "PENDING" && onCancelWithdrawal && (
                                                <button
                                                    onClick={() => onCancelWithdrawal(t.id)}
                                                    className="mt-2 text-[10px] bg-red-900/20 text-red-400 px-2 py-1 rounded hover:bg-red-900/40 transition-colors border border-red-900/30"
                                                >
                                                    Cancel Request
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showWithdrawModal && (
                <BankWithdrawalModal
                    onClose={() => setShowWithdrawModal(false)}
                    availableBalance={availableBalance}
                    savedBank={savedBank}
                    onSaveBank={onSaveBank}
                    onConfirm={(amount, bank) => {
                        // Pass banking info if needed, or just handle withdrawal
                        onWithdraw(amount);
                        setShowWithdrawModal(false);
                    }}
                />
            )}
        </div>
    );
}

function getStatusStyle(status: string) {
    switch (status) {
        case "COMPLETED": return "bg-green-500/10 text-green-500 border-green-500/20";
        case "AVAILABLE": return "bg-green-500/10 text-green-500 border-green-500/20";
        case "PENDING": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
        case "LOCKED": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
        case "CANCELLED": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
        case "REJECTED": return "bg-red-500/10 text-red-500 border-red-500/20";
        default: return "bg-gray-500/10 text-gray-500 border-transparent";
    }
}
