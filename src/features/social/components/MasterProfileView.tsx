"use client";

// ... (imports remain)
import { useState, useEffect } from "react";
import { ChevronLeft, Heart, Bot, ShieldCheck, Ticket, Sparkles, Copy, Users, Wallet, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Master, SessionType, UserRole, AccountStatus } from "@/types";
import { SafetyGuardModal } from "@/features/trading/components/SafetyGuardModal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import TraderAnalysisDashboard from "@/features/social/components/TraderAnalysisDashboard";
import { getUserIdByName } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface MasterProfileViewProps {
    master: Master;
    onBack: () => void;
    requireAuth: (action: () => void) => void;
    // Removing isPreview
    isFav?: boolean;
    onToggleFav?: () => void;
    onStartCopy: (master: Master, amount: number, risk: number | string, sessionType: SessionType, advanced?: { autoRenew: boolean, timeConfig: any }) => void;
    onStopCopy: (id: number) => void;
    isCopying?: boolean;
    maxAlloc?: number;
    userRole?: UserRole;
    hasUsed7DayTrial?: boolean;
    accountStatus?: AccountStatus;
    onOpenSettings?: () => void;
    dailyTicketUsed?: boolean;
}

export function MasterProfileView({ master, onBack, requireAuth, isFav, onToggleFav, onStartCopy, onStopCopy, isCopying, maxAlloc, hasUsed7DayTrial, userRole, accountStatus, onOpenSettings, dailyTicketUsed }: MasterProfileViewProps) {
    const [safetyModalOpen, setSafetyModalOpen] = useState(false);
    const [aiGuardRisk, setAiGuardRisk] = useState<number | string>(20);
    const [allocation, setAllocation] = useState<number | string>(1000);
    const [selectedSessionType, setSelectedSessionType] = useState<SessionType>("DAILY");
    const [useWelcomeTicket, setUseWelcomeTicket] = useState(false);

    // ⚙️ Advanced Settings State (Lifted)
    const [autoRenew, setAutoRenew] = useState(true); // Default ON
    const [timeConfig, setTimeConfig] = useState<any>({ mode: "24/7", start: "09:00", end: "17:00" }); // Default 24/7

    const [resolvedUserId, setResolvedUserId] = useState<string | null>(master.masterUserId || master.userId || null);

    useEffect(() => {
        if (master.masterUserId || master.userId) {
            setResolvedUserId(master.masterUserId || master.userId || null);
            return;
        }
        let isMounted = true;
        getUserIdByName(master.name).then(id => {
            if (isMounted && id) setResolvedUserId(id);
        });
        return () => { isMounted = false; };
    }, [master]);

    const isPremium = master.monthlyFee > 0;
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
            openConfirm("Stop Copying?", `Are you sure you want to stop copying ${master.name}?`, () => { onStopCopy(master.id); onBack(); }, "danger");
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
                        `Start your 7-Day Free Trial with ${master.name}?\n\nThis is a one-time offer.`,
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
            <div className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center justify-between p-4 max-w-7xl mx-auto">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <div className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Trader Profile</div>
                    <Button variant="ghost" size="icon" onClick={onToggleFav} className={isFav ? "text-red-500 hover:text-red-600" : ""}>
                        <Heart className="h-6 w-6" fill={isFav ? "currentColor" : "none"} />
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-8">

                {/* 1. PROFILE HEADER CARD */}
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                        <AvatarImage src={master.avatar} />
                        <AvatarFallback>{master.name.substring(0, 2)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">{master.name}</h1>
                            {master.type === "AI_BOT" && <Badge variant="secondary" className="gap-1"><Bot className="w-3 h-3" /> AI System</Badge>}
                            {!master.isPublic && <Badge variant="destructive" className="gap-1">Private</Badge>}
                        </div>
                        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                            {master.desc}
                        </p>
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {master.tags?.filter(t => t !== "DRAFT MODE").map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs px-2 py-0.5 border-dashed">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Quick Stats Grid (Top Right) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full md:w-auto">
                        <Card className="bg-muted/50 border-none shadow-none">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <Users className="h-4 w-4 text-muted-foreground mb-1" />
                                <div className="text-lg font-bold">{master.followers.toLocaleString()}</div>
                                <div className="text-[10px] uppercase text-muted-foreground font-medium">Copiers</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-muted/50 border-none shadow-none">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <Wallet className="h-4 w-4 text-muted-foreground mb-1" />
                                <div className="text-lg font-bold">${master.minDeposit}</div>
                                <div className="text-[10px] uppercase text-muted-foreground font-medium">Min Deposit</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-muted/50 border-none shadow-none">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <TrendingUp className="h-4 w-4 text-muted-foreground mb-1" />
                                <div className="text-lg font-bold">1:{master.leverage || 500}</div>
                                <div className="text-[10px] uppercase text-muted-foreground font-medium">Leverage</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-muted/50 border-none shadow-none">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <Copy className="h-4 w-4 text-muted-foreground mb-1" />
                                <div className="text-lg font-bold">{isPremium ? `$${master.monthlyFee}` : "Free"}</div>
                                <div className="text-[10px] uppercase text-muted-foreground font-medium">{isPremium ? "Monthly" : "Access"}</div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Separator className="bg-white/10" />

                {/* 2. TRADER ANALYSIS DASHBOARD (FTMO Style) */}
                <div className="min-h-[500px]">
                    <TraderAnalysisDashboard
                        masterId={resolvedUserId || ""}
                        isOwnProfile={master.id === 0}
                    />
                </div>

            </div>

            {/* 3. STICKY FOOTER (ACTION BAR) - Hide if Own Profile (id === 0) */}
            {userRole !== "MASTER" && master.id !== 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-50">
                    <div className="max-w-xl mx-auto flex items-center justify-center gap-4">
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
                    </div>
                </div>
            )}

            {safetyModalOpen && (
                <SafetyGuardModal
                    initialRisk={aiGuardRisk}
                    initialAllocation={allocation}
                    maxAlloc={maxAlloc || 0}
                    initialAutoRenew={autoRenew}
                    initialTimeConfig={timeConfig}
                    initialUseWelcome={useWelcomeTicket}
                    showWelcomeOption={!hasUsed7DayTrial && selectedSessionType === "DAILY"}
                    onClose={() => setSafetyModalOpen(false)}
                    onConfirm={(data) => {
                        // Persist preferences locally if needed
                        setAiGuardRisk(data.risk);
                        setAllocation(data.allocation);
                        setAutoRenew(data.autoRenew);
                        setTimeConfig(data.timeConfig);

                        const finalType = (selectedSessionType === "DAILY" && data.useWelcome) ? "TRIAL_7DAY" : selectedSessionType;
                        onStartCopy(master, data.allocation, data.risk, finalType, { autoRenew: data.autoRenew, timeConfig: data.timeConfig });

                        setSafetyModalOpen(false);
                        setUseWelcomeTicket(false);
                        onBack();
                    }}
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
