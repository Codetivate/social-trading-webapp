import { useState, useEffect } from "react";
import { X, ChevronLeft, Landmark, CreditCard, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Bank {
    id: string;
    name: string;
    color: string;
    icon: React.ReactNode;
}

const BANKS: Bank[] = [
    { id: "kbank", name: "Kasikorn Bank", color: "bg-green-600", icon: <Landmark className="text-white" /> },
    { id: "scb", name: "SCB", color: "bg-purple-600", icon: <Landmark className="text-white" /> },
    { id: "bbl", name: "Bangkok Bank", color: "bg-blue-700", icon: <Landmark className="text-white" /> },
    { id: "ktb", name: "Krungthai", color: "bg-sky-500", icon: <Landmark className="text-white" /> },
    { id: "ttb", name: "TTB", color: "bg-blue-500", icon: <Landmark className="text-white" /> },
    { id: "gsb", name: "GSB", color: "bg-pink-500", icon: <Landmark className="text-white" /> },
];

interface BankWithdrawalModalProps {
    onClose: () => void;
    availableBalance: number;
    onConfirm: (amount: number, bankDetails: any) => void;
    savedBank: { id: string, name: string, account: string, bank: string } | null;
    onSaveBank: (bank: any) => void;
}

export function BankWithdrawalModal({ onClose, availableBalance, onConfirm, savedBank, onSaveBank }: BankWithdrawalModalProps) {
    const [step, setStep] = useState<"BANK_SELECT" | "DETAILS" | "CONFIRM" | "SUCCESS">(savedBank ? "CONFIRM" : "BANK_SELECT");
    const [selectedBank, setSelectedBank] = useState<Bank | null>(
        savedBank ? BANKS.find(b => b.name === savedBank.bank) || null : null
    );
    const [accountNumber, setAccountNumber] = useState(savedBank?.account || "");
    const [accountName, setAccountName] = useState(savedBank?.name || "");
    const [amount, setAmount] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNext = () => {
        if (step === "BANK_SELECT") {
            if (selectedBank) setStep("DETAILS");
        } else if (step === "DETAILS") {
            if (accountNumber.length > 8 && accountName.length > 3) {
                // Save locally first
                const bankInfo = { id: selectedBank?.id, bank: selectedBank?.name, name: accountName, account: accountNumber };
                onSaveBank(bankInfo);
                setStep("CONFIRM");
            } else {
                toast.error("Invalid Details", { description: "Please check account number and name." });
            }
        }
    };

    const handleChangeBank = () => {
        setStep("BANK_SELECT");
        setSelectedBank(null);
        setAccountNumber("");
        setAccountName("");
        onSaveBank(null);
    }

    const handleEditBank = () => {
        setStep("DETAILS");
    }

    const handleConfirm = () => {
        if (!amount || Number(amount) < 10 || Number(amount) > availableBalance) {
            toast.error("Invalid Amount", { description: "Min $10 and check available balance." });
            return;
        }

        setIsSubmitting(true);
        // Simulate API
        setTimeout(() => {
            setIsSubmitting(false);
            setStep("SUCCESS");
            onConfirm(Number(amount), { bank: selectedBank?.name, account: accountNumber, name: accountName });
        }, 2000);
    };

    return (
        <div className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in slide-in-from-bottom-5">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <div className="flex items-center gap-2">
                        {step !== "BANK_SELECT" && step !== "SUCCESS" && !savedBank && (
                            <button onClick={() => setStep(prev => prev === "CONFIRM" ? "DETAILS" : "BANK_SELECT")} className="p-1 -ml-2 rounded-full hover:bg-gray-800 transition-colors">
                                <ChevronLeft size={20} className="text-gray-400" />
                            </button>
                        )}
                        <h3 className="font-bold text-white">
                            {step === "BANK_SELECT" && "Select Bank"}
                            {step === "DETAILS" && "Bank Details"}
                            {step === "CONFIRM" && "Review Request"}
                            {step === "SUCCESS" && "Request Sent"}
                        </h3>
                    </div>
                    {step !== "SUCCESS" && <button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button>}
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {step === "BANK_SELECT" && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400">Choose your bank for withdrawal.</p>
                            <div className="grid grid-cols-3 gap-3">
                                {BANKS.map(bank => (
                                    <button
                                        key={bank.id}
                                        onClick={() => setSelectedBank(bank)}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${selectedBank?.id === bank.id ? "bg-gray-800 border-blue-500 ring-1 ring-blue-500 scale-105" : "bg-gray-800/50 border-gray-700 hover:bg-gray-800"}`}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${bank.color}`}>
                                            {bank.icon}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-300 text-center leading-tight">{bank.name}</span>
                                    </button>
                                ))}
                            </div>
                            <button onClick={handleNext} disabled={!selectedBank} className="w-full mt-4 bg-white text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors">
                                Next Step
                            </button>
                        </div>
                    )}

                    {step === "DETAILS" && (
                        <div className="space-y-4 animate-in slide-in-from-right">
                            <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${selectedBank?.color}`}>{selectedBank?.icon}</div>
                                <div><p className="text-sm font-bold text-white">{selectedBank?.name}</p><p className="text-[10px] text-gray-400">Selected Bank</p></div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Account Number</label>
                                <div className="relative">
                                    <CreditCard size={18} className="absolute left-3 top-3 text-gray-500" />
                                    <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} type="text" placeholder="123-4-56789-0" className="w-full bg-gray-950 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:border-blue-500 outline-none" inputMode="numeric" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Account Name</label>
                                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} type="text" placeholder="John Doe" className="w-full bg-gray-950 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-600 focus:border-blue-500 outline-none" />
                                <p className="text-[10px] text-yellow-500/80 flex items-center gap-1 mt-1"><AlertCircle size={10} /> Must match your verified ID.</p>
                            </div>

                            <button onClick={handleNext} className="w-full mt-4 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition-colors">
                                Verify & Continue
                            </button>
                        </div>
                    )}

                    {step === "CONFIRM" && (
                        <div className="space-y-6 animate-in slide-in-from-right">

                            {/* Saved Bank Card */}
                            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-gray-700 relative overflow-hidden group">
                                <div className="flex justify-between items-start z-10 relative">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${selectedBank?.color}`}>{selectedBank?.icon}</div>
                                        <div>
                                            <p className="text-sm font-bold text-white">{selectedBank?.name}</p>
                                            <p className="text-xs font-mono text-gray-300">{accountNumber}</p>
                                            <p className="text-[10px] text-gray-500">{accountName}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleEditBank} className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors" title="Edit"><Pencil size={14} /></button>
                                        <button onClick={handleChangeBank} className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors" title="Remove"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center space-y-1">
                                <p className="text-gray-400 text-xs uppercase">Available Balance</p>
                                <h2 className="text-3xl font-bold text-white">${availableBalance.toLocaleString()}</h2>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Withdraw Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-white font-mono text-lg">$</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-gray-800 border-b-2 border-gray-600 rounded-t-xl py-2 pl-8 pr-4 text-2xl font-mono text-white focus:border-blue-500 outline-none transition-colors"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-800/50 p-4 rounded-xl space-y-3 text-xs">
                                <div className="flex justify-between text-gray-400"><span>To:</span> <span className="text-white font-bold">{selectedBank?.name} ({accountNumber})</span></div>
                                <div className="flex justify-between text-gray-400"><span>Fee:</span> <span className="text-white font-bold">$0.00 (Free)</span></div>
                                <div className="flex justify-between text-gray-400 pt-2 border-t border-gray-700"><span>Total:</span> <span className="text-blue-400 font-bold">${Number(amount || 0).toLocaleString()}</span></div>
                            </div>

                            <button onClick={handleConfirm} disabled={isSubmitting} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/20">
                                {isSubmitting ? "Processing..." : <><ShieldCheck size={18} /> Confirm Withdrawal</>}
                            </button>
                        </div>
                    )}

                    {step === "SUCCESS" && (
                        <div className="text-center space-y-6 animate-in zoom-in py-8">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/30 animate-bounce">
                                <CheckCircle2 size={40} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">Withdrawal Sent!</h2>
                                <p className="text-gray-400 text-sm mt-2">Your request is being processed by our system.</p>
                                <p className="text-xs text-gray-500 mt-1">Est. arrival: 15-30 mins</p>
                            </div>
                            <button onClick={onClose} className="w-full bg-gray-800 text-white font-bold py-3 rounded-xl hover:bg-gray-700 transition-colors">
                                Close Window
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
