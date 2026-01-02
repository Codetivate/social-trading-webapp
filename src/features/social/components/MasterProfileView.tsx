import { useState } from "react";
import { ChevronLeft, Heart, Bot, Crown, BadgeCheck, AreaChart, PlayCircle, StopCircle, Ticket, Sparkles, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Master, SessionType, UserRole, AccountStatus } from "@/types";
import { SafetyGuardModal } from "@/features/trading/components/SafetyGuardModal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

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
    accountStatus?: AccountStatus;
    onOpenSettings?: () => void;
    dailyTicketUsed?: boolean; // ✅ New Prop
}

export function MasterProfileView({ master, onBack, requireAuth, isPreview = false, isFav, onToggleFav, onStartCopy, onStopCopy, isCopying, maxAlloc, isVip, isGoldenActive, hasUsed7DayTrial, userRole, onOpenVIP, goldenTickets = 0, accountStatus, onOpenSettings, dailyTicketUsed }: MasterProfileViewProps) {
    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [aiGuardRisk, setAiGuardRisk] = useState<number | string>(20);
    const [allocation, setAllocation] = useState<number | string>(1000);
    const [selectedSessionType, setSelectedSessionType] = useState<SessionType>("DAILY");
    const [useWelcomeTicket, setUseWelcomeTicket] = useState(false); // ✅ New State

    const isPremium = master.monthlyFee > 0;
    const hasTicket = goldenTickets > 0;

    // Logic: Available if Premium AND User hasn't used trial AND User doesn't have an active Golden pass/VIP
    const canUse7DayTrial = isPremium && !hasUsed7DayTrial && !isGoldenActive && !isVip;

    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; type: "info" | "danger" | "success" | "warning"; onConfirm: () => void }>({ isOpen: false, title: "", message: "", type: "info", onConfirm: () => { } });

    const openConfirm = (title: string, message: string, onConfirm: () => void, type: "info" | "danger" | "success" | "warning" = "info") => {
        setConfirmModal({ isOpen: true, title, message, type, onConfirm });
    };

    const handleCopyAction = () => {
        if (userRole === "MASTER") {
            openConfirm("Spy Mode", "👀 You are in Master View (Spy Mode).\nActions are disabled.", () => { }, "warning");
            return;
        }

        if (isCopying) {
            openConfirm("Stop Copying?", `Are you sure you want to stop copying ${master.name}?`, () => { onStopCopy(master.id); onBack(); }, "danger");
        }
        else {
            // 🔒 CHECK: BROKER CONNECTION
            if (accountStatus !== "CONNECTED" && !isPreview) {
                toast.error("Broker Not Connected", { description: "Please connect your MT5 Broker Account first!" });
                if (onOpenSettings) onOpenSettings();
                return;
            }

            // 1. Golden Ticket / VIP Active (Highest Priority)
            if (isGoldenActive || isVip) {
                setSelectedSessionType("GOLDEN");
                requireAuth(() => setSafetyModalOpen(true));
                return;
            }

            // 2. Premium Master Logic
            if (isPremium) {
                // 2.1 First Time 7-Day Trial
                if (canUse7DayTrial) {
                    openConfirm(
                        "🎁 Special 7-Day Trial",
                        `Start your 7-Day Free Trial with ${master.name}?\n\n⚠️ IMPORTANT: This is a one-time use. If you Stop this session, the trial is BURNED forever.\n\n(After 7 days, subscription required)`,
                        () => {
                            setSelectedSessionType("TRIAL_7DAY");
                            requireAuth(() => setSafetyModalOpen(true));
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        },
                        "success"
                    );
                } else {
                    // 2.2 Trial Used -> Upsell VIP or Paid
                    openConfirm(
                        "💰 Premium Access Required",
                        `Subscription Required: $${master.monthlyFee}/month\n\nOr Unlock VIP (Golden Ticket) to copy for FREE!`,
                        () => {
                            // Check if user wants to pay or upgrade? 
                            // Simplified flow: Prompt for Payment vs Upgrade
                            // For now, let's open VIP upgrade as default upsell
                            if (onOpenVIP) {
                                onOpenVIP();
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            }
                        },
                        "warning"
                    );
                }
                return;
            }

            // 3. Free Master (Daily Pass)
            setSelectedSessionType("DAILY");

            // ✅ Auto-Select Welcome Ticket if Daily is Used (and Welcome is available)
            if (dailyTicketUsed && !hasUsed7DayTrial) {
                setUseWelcomeTicket(true);
            } else {
                setUseWelcomeTicket(false);
            }

            requireAuth(() => setSafetyModalOpen(true));
        }
    };

    return (
        <div className={`fixed inset-0 bg-void z-50 overflow-y-auto pb-32 ${isPreview ? "absolute rounded-3xl" : ""}`}>

            {/* Header Transparent */}
            <div className="sticky top-0 z-40 p-4 flex items-center justify-between pointer-events-none">
                <button
                    onClick={onBack}
                    className="bg-black/20 backdrop-blur-md p-2 rounded-full text-white hover:bg-black/40 pointer-events-auto transition-all border border-white/10 active:scale-95"
                >
                    <ChevronLeft size={24} />
                </button>
                {!isPreview && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleFav) onToggleFav();
                        }}
                        className={`p-2 rounded-full transition-all pointer-events-auto backdrop-blur-md border border-white/10 active:scale-95 ${isFav ? "bg-red-500/20 text-red-500 border-red-500/50" : "bg-black/20 text-white"}`}
                    >
                        <Heart size={24} fill={isFav ? "currentColor" : "none"} />
                    </button>
                )}
            </div>

            {/* Cover Image & Avatar */}
            <div className="relative -mt-20">
                <div className="h-56 w-full bg-gradient-to-b from-indigo-900 via-purple-900 to-gray-950 opacity-80"></div>
                <div className="absolute -bottom-14 left-0 right-0 flex justify-center">
                    <div className="relative">
                        <div className="absolute inset-0 bg-neon-purple blur-2xl opacity-40 rounded-full"></div>
                        <img src={master.avatar} alt={master.name} className="w-32 h-32 rounded-full border-[6px] border-void bg-space shadow-2xl relative z-10" />
                        {master.type === "AI_BOT" && <div className="absolute bottom-2 right-2 bg-neon-cyan text-black p-1.5 rounded-full border-4 border-void z-20"><Bot size={16} /></div>}
                        {isPremium && <div className="absolute top-1 right-1 bg-yellow-400 text-black p-1.5 rounded-full border-4 border-void shadow-lg z-20"><Crown size={14} fill="black" /></div>}
                    </div>
                </div>
            </div>

            {/* Profile Info */}
            <div className="mt-16 px-6 text-center space-y-5">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2 mb-1">
                        {master.name}
                        {master.isVip && <BadgeCheck className="text-blue-500" size={24} fill="currentColor" color="black" />}
                        {!master.isPublic && (
                            <div className="bg-red-500/20 border border-red-500/40 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <EyeOff size={12} /> PRIVATE
                            </div>
                        )}
                    </h1>
                    <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">{master.desc}</p>
                </div>


                {/* 📊 METRICS GRID */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="glass-panel p-4 rounded-2xl text-center hover:border-neon-cyan/50 transition-colors">
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Total Profit</p>
                        <p className="text-xl font-bold text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">+{master.roi}%</p>
                    </div>
                    <div className="glass-panel p-4 rounded-2xl text-center hover:border-red-500/50 transition-colors">
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Max Drawdown</p>
                        <p className="text-xl font-bold text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">{master.drawdown}%</p>
                    </div>
                    <div className="glass-panel p-4 rounded-2xl text-center hover:border-neon-purple/50 transition-colors">
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Total Investors</p>
                        <p className="text-xl font-bold text-neon-purple drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]">{master.followers.toLocaleString()}</p>
                    </div>
                </div>

                {/* Tags */}
                <div className="flex justify-center flex-wrap gap-2">
                    {master.tags?.map((t: string, i: number) => <span key={i} className="bg-gray-800/80 text-gray-300 text-[10px] px-3 py-1 rounded-full border border-gray-700 font-medium">{t}</span>)}
                </div>

                {/* Charts Area */}
                {/* Charts Area */}
                <div className="bg-space/80 backdrop-blur-sm p-6 rounded-3xl border border-white/5 shadow-inner">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-sm flex items-center gap-2 text-white"><AreaChart size={18} className="text-purple-500" /> Performance</h3>
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded-lg">All Time</span>
                    </div>
                    <div className="h-40 w-full flex items-end gap-1 relative p-1">
                        {/* Fake Grid Lines */}
                        <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none">
                            <div className="border-t border-white w-full"></div>
                            <div className="border-t border-white w-full"></div>
                            <div className="border-t border-white w-full"></div>
                        </div>
                        <svg className="absolute inset-0 w-full h-full text-purple-500/20" fill="currentColor" preserveAspectRatio="none" viewBox="0 0 350 160"><path d="M0,160 L20,140 L40,145 L60,110 L80,115 L100,80 L120,90 L140,50 L160,60 L180,30 L200,40 L220,10 L350,5 L350,160 Z" /></svg>
                        <svg className="absolute inset-0 w-full h-full text-purple-500 stroke-current stroke-[3px] fill-none drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]" preserveAspectRatio="none" viewBox="0 0 350 160"><path d="M0,160 L20,140 L40,145 L60,110 L80,115 L100,80 L120,90 L140,50 L160,60 L180,30 L200,40 L220,10 L350,5" /></svg>
                    </div>
                </div>
            </div>

            {/* ✨ NEW FLOATING ACTION BAR (CENTERED & MODERN) */}
            {!isPreview && userRole !== "MASTER" && (
                <div className="fixed bottom-6 left-0 w-full flex justify-center z-50 px-4 pointer-events-none">
                    <div className="pointer-events-auto w-full max-w-sm glass-panel rounded-[2rem] p-2 pl-5 pr-2 flex items-center justify-between gap-4 transition-all transform hover:scale-[1.01] hover:border-white/20">

                        {/* Left: Info */}
                        <div className="flex flex-col">
                            {isCopying ? (
                                <div className="animate-pulse">
                                    <p className="text-[10px] text-green-400 font-bold uppercase tracking-widest mb-0.5">● Active</p>
                                    <p className="text-sm font-bold text-white">Running...</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">
                                        {isPremium ? "Subscription" : "Service Fee"}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {isPremium ? (
                                            <>
                                                <span className="text-xl font-bold text-white">${master.monthlyFee}</span>
                                                <span className="text-xs text-gray-500 font-medium">/mo</span>
                                            </>
                                        ) : (
                                            <span className="text-xl font-bold text-green-400 flex items-center gap-1">FREE <span className="text-xs text-gray-500 font-normal">access</span></span>
                                        )}
                                    </div>

                                    {/* Badge Logic */}
                                    {isGoldenActive && <p className="text-[9px] text-yellow-400 animate-pulse font-bold mt-1 flex items-center gap-1"><Ticket size={10} /> Golden Ticket Active</p>}
                                    {canUse7DayTrial && <p className="text-[9px] text-purple-400 animate-pulse font-bold mt-1 flex items-center gap-1"><Sparkles size={10} /> 7-Day Free Trial Available</p>}
                                </div>
                            )}
                        </div>

                        {/* Right: Big Button */}
                        <button
                            onClick={handleCopyAction}
                            className={`h-14 px-8 rounded-[1.5rem] font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap
                                ${isCopying
                                    ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20"
                                    : isGoldenActive
                                        ? "bg-gradient-to-r from-yellow-300 to-amber-500 text-black shadow-amber-500/30 hover:brightness-110"
                                        : canUse7DayTrial
                                            ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-purple-500/30 hover:brightness-110"
                                            : "bg-white text-black hover:bg-gray-200 shadow-white/10"
                                }`}
                        >
                            {isCopying ? (
                                <><StopCircle size={20} /> Stop</>
                            ) : !master.isPublic ? (
                                <><EyeOff size={20} /> Private</>
                            ) : (
                                <>{isGoldenActive ? <Ticket size={20} fill="black" /> : canUse7DayTrial ? <Sparkles size={20} /> : <PlayCircle size={20} fill="currentColor" />}
                                    <span className="text-base">
                                        {isGoldenActive ? "Use Ticket" : canUse7DayTrial ? "Start Trial" : "Copy Now"}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {safetyModalOpen && (
                <SafetyGuardModal
                    risk={aiGuardRisk}
                    setRisk={setAiGuardRisk}
                    allocation={allocation}
                    setAllocation={setAllocation}
                    onClose={() => setSafetyModalOpen(false)}
                    onConfirm={() => {
                        // Priority: VIP/Golden > User Selection (Welcome) > Selected Type (Daily/Trial)
                        // If selected is DAILY and user checked Welcome, switch to TRIAL_7DAY
                        const finalType = (selectedSessionType === "DAILY" && useWelcomeTicket) ? "TRIAL_7DAY" : selectedSessionType;
                        onStartCopy(master, Number(allocation), aiGuardRisk, finalType);
                        setSafetyModalOpen(false);
                        setUseWelcomeTicket(false);
                        onBack();
                    }}
                    maxAlloc={maxAlloc || 0}
                    showWelcomeOption={!isVip && !hasUsed7DayTrial && selectedSessionType === "DAILY"} // Only show for Daily default
                    useWelcome={useWelcomeTicket}
                    setUseWelcome={setUseWelcomeTicket}
                />
            )}

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
            />
        </div>
    )
}
