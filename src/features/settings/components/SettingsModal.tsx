import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, X, LogOut, Briefcase, UserCircle2, Crown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { UserRole, AccountStatus, Session as CopySession, MasterProfile } from "@/types";
import { getUserProfile, updateMasterProfile, activateMasterAccount, downgradeMaster, disconnectBroker } from "@/app/actions/user";
import { MasterProfileEditor } from "@/features/social/components/MasterProfileEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface SettingsModalProps {
    onClose: () => void;
    status: AccountStatus;
    setStatus: (status: AccountStatus) => void;
    role: UserRole;
    setRole: (role: UserRole) => void;
    setViewMode: (mode: UserRole) => void;
    onLogout: () => void;
    isVip: boolean;
    setIsVip: (isVip: boolean) => void;
    activeSessions: CopySession[];
    onStopAll: () => void;
    profile: MasterProfile;
    setProfile: (p: MasterProfile) => void;
    onRequestActivation: () => void;
    openConfirm: (title: string, message: string, onConfirm: () => void, type?: "info" | "danger" | "success" | "warning") => void;
    defaultShowBroker?: boolean;
    brokerAccount?: any | null;
    user?: { id?: string; name?: string | null; email?: string | null; image?: string | null };
    onConnectionSuccess?: (account: any) => void;
}

export function SettingsModal({ onClose, status, setStatus, role, setRole, setViewMode, onLogout, isVip, setIsVip, activeSessions, onStopAll, profile, setProfile, onRequestActivation, openConfirm, defaultShowBroker = false, user, brokerAccount, onConnectionSuccess }: SettingsModalProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"ACCOUNT" | "PROFILE">("ACCOUNT");

    // --- BROKER STATE & REFS ---
    const [isConnecting, setIsConnecting] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedServer, setSelectedServer] = useState("");
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [showBrokerForm, setShowBrokerForm] = useState(defaultShowBroker);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const brokerSectionRef = React.useRef<HTMLDivElement>(null);

    // 🟢 Auto-Scroll to Broker Section if opened via Redirect
    React.useEffect(() => {
        if (defaultShowBroker) {
            setTimeout(() => {
                brokerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
        }
    }, [defaultShowBroker]);

    // 🟢 Load Remembered Credentials from Session
    React.useEffect(() => {
        if (showBrokerForm) {
            const lastLogin = sessionStorage.getItem("lastBrokerLogin");
            const lastServer = sessionStorage.getItem("lastBrokerServer");
            if (lastLogin && !loginId) setLoginId(lastLogin);
            if (lastServer && !selectedServer) {
                setSelectedServer(lastServer);
                setSearch(lastServer);
            }
        }
    }, [showBrokerForm]);

    const MOCK_BROKERS = [
        "Exness-MT5Real", "Exness-MT5Trial",
        "XMGlobal-MT5-Real", "XMGlobal-MT5-Demo",
        "ICMarkets-MT5-Live", "ICMarkets-MT5-Demo",
        "Pepperstone-MT5-01", "Pepperstone-MT5-02",
        "FPMarkets-Live", "FPMarkets-Demo",
        "RoboForex-Pro", "RoboForex-ECN",
        "JustForex-Live", "Alpari-MT5-Real"
    ];
    const filteredBrokers = MOCK_BROKERS.filter(b => b.toLowerCase().includes(search.toLowerCase()));

    // 🔥 ROLE SWITCH LOGIC
    const handleBecomeMaster = () => {
        if (status !== "CONNECTED") {
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Broker Account first!" });
            setShowBrokerForm(true);
            // 🟢 Scroll and Focus Logic
            setTimeout(() => {
                brokerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }

        if (activeSessions.length > 0) {
            openConfirm(
                "⚠️ Switch Mode Warning",
                `Switching to Master Mode will CANCEL all your ${activeSessions.length} active copy sessions.\n\nDo you want to proceed?`,
                () => {
                    onStopAll();
                    onClose();
                    onRequestActivation();
                },
                "warning"
            );
            return;
        }
        onClose();
        onRequestActivation();
    };

    const handleDowngrade = async () => {
        openConfirm(
            "Switch back to Follower mode?",
            "⚠️ Warning: Your Master broadcasting will completely STOP.\n\n💰 Any active subscribers will be automatically refunded for the remaining period.",
            async () => {
                try {
                    const res = await downgradeMaster(user?.id || ""); // Use downgradeMaster
                    if (res.success) {
                        setRole("FOLLOWER");
                        setViewMode("FOLLOWER");
                        onClose();
                        toast.success("Switched to Follower Mode");
                    } else {
                        toast.error("Downgrade Failed", { description: res.error });
                    }
                } catch (e) { console.error(e); toast.error("Failed to switch role"); }
            },
            "danger"
        );
    }

    const handleLogout = () => {
        openConfirm("Logout", "Are you sure you want to logout?", () => onLogout(), "danger");
    };

    // --- BROKER CONNECTION HELPERS ---

    const handleConnectBroker = async () => {
        // Use 'search' as the server value since it tracks the input field
        const serverToUse = selectedServer || search;

        if (!serverToUse || !loginId || !password) {
            toast.error("Missing Info", { description: "Please fill all fields" });
            return;
        }

        setIsConnecting(true);
        try {
            // 🛡️ Basic Validation Check
            if (isNaN(Number(loginId))) {
                toast.error("Invalid Login ID", { description: "Login ID must be numeric." });
                setIsConnecting(false);
                return;
            }

            const toastId = toast.loading("Verifying credentials with Broker..."); // 🟢 Better UX

            // ⏳ Simulate Verification Delay
            await new Promise(r => setTimeout(r, 1500));

            const res = await fetch("/api/user/broker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ server: serverToUse, login: loginId, password })
            });

            if (!res.ok) throw new Error("Failed to connect");

            toast.success("Broker Connected", { id: toastId, description: "Your MT5 account has been linked successfully." });
            setStatus("CONNECTED");

            // Optimistic Update
            if (onConnectionSuccess) {
                onConnectionSuccess({
                    server: serverToUse,
                    login: loginId,
                    status: "CONNECTED",
                    balance: 10000.00, // Mock initial
                    equity: 10000.00,
                    userId: "123456" // Mock ID so it doesn't crash on undefined
                });
            }

            setShowBrokerForm(false);
            setLoginId(""); setPassword(""); setSelectedServer("");
            router.refresh(); // Refresh server data
        } catch (error) {
            toast.dismiss(); // dismiss loading toast if active
            toast.error("Connection Failed", { description: "Could not connect to broker server." });
        } finally {
            setIsConnecting(false);
        }
    }

    const handleSelectServer = (server: string) => {
        setSelectedServer(server);
        setSearch(server);
        setShowSuggestions(false);
    };

    return (
        <div
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose} // 🟢 Close on Backdrop Click
        >
            {/* 🎨 Main Modal Card with Neon Glow */}
            <Card
                className="w-full max-w-md bg-space border-white/10 shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] overflow-hidden rounded-3xl h-[85vh] sm:h-auto sm:max-h-[90vh] flex flex-col relative"
                onClick={(e) => e.stopPropagation()} // 🛑 Prevent close when clicking inside
            >
                {/* Neon Top Line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-neon-purple/50 blur-lg pointer-events-none"></div>

                {/* Header */}
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-full ring-1 ring-white/10">
                            <Settings className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">{activeTab === "PROFILE" ? "Edit Profile" : "Settings"}</h2>
                    </div>
                    <button onClick={onClose} className="bg-white/5 hover:bg-white/10 p-2 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-white/5">
                    <button onClick={() => setActiveTab("ACCOUNT")} className={`flex-1 py-4 text-xs font-bold transition-all relative ${activeTab === "ACCOUNT" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
                        Account
                        {activeTab === "ACCOUNT" && <span className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-purple to-neon-cyan shadow-[0_0_10px_rgba(139,92,246,0.5)]"></span>}
                    </button>
                    <button onClick={() => setActiveTab("PROFILE")} className={`flex-1 py-4 text-xs font-bold transition-all relative ${activeTab === "PROFILE" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
                        Public Profile {role === "FOLLOWER" && "(Draft)"}
                        {activeTab === "PROFILE" && <span className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-purple to-neon-cyan shadow-[0_0_10px_rgba(139,92,246,0.5)]"></span>}
                    </button>
                </div>

                {/* Content Area */}
                <div className="overflow-y-auto p-6 space-y-6 flex-1 scrollbar-none">
                    {activeTab === "ACCOUNT" ? (
                        <>
                            {/* 👤 Identity Card */}
                            <div className="bg-[#1A1D25] border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <img src={user?.image || "https://api.dicebear.com/7.x/avataaars/svg?seed=User"} alt="Profile" className="w-12 h-12 rounded-full border-2 border-white/10" />
                                        {/* Status Dot */}
                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1A1D25] rounded-full"></div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{user?.name || "Trader"}</h3>
                                        <p className="text-[11px] text-gray-400 flex items-center gap-2">
                                            {user?.email || "No Email"}
                                            <span className="bg-[#2A3040] text-blue-400 px-1.5 py-0.5 rounded text-[8px] font-bold border border-blue-500/20">GOOGLE</span>
                                        </p>
                                    </div>
                                </div>
                                <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 p-2 transition-colors">
                                    <LogOut size={18} />
                                </button>
                            </div>

                            <div className="space-y-3" ref={brokerSectionRef}>
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider pl-1">Broker Account</label>

                                {status === "CONNECTED" && brokerAccount ? (
                                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1115] to-[#13151C] border border-white/5 hover:border-green-500/20 transition-all duration-300">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-green-500/10 transition-all"></div>

                                        <div className="relative p-5">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-[#1A1D25] ring-1 ring-white/5 flex items-center justify-center relative group-hover:scale-105 transition-transform">
                                                        <Briefcase className="text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]" size={24} />
                                                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#13151C]"></div>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-white tracking-wide">{brokerAccount.server}</h4>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">#{brokerAccount.login}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <span className="text-[10px] font-bold text-green-500 flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20 shadow-[0_0_10px_rgba(74,222,128,0.1)]">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                        CONNECTED
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                    <span className="flex items-center gap-1.5"><div className="w-1 h-1 bg-gray-600 rounded-full"></div>Bridge Active</span>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        const confirmId = toast.loading("Disconnecting...");
                                                        // 💾 Remember credentials for quick reconnect
                                                        if (brokerAccount) {
                                                            sessionStorage.setItem("lastBrokerLogin", brokerAccount.login);
                                                            sessionStorage.setItem("lastBrokerServer", brokerAccount.server);
                                                        }

                                                        const res = await disconnectBroker(user?.id || "");
                                                        if (res.success) {
                                                            toast.success("Broker Disconnected", { id: confirmId });
                                                            setStatus("DISCONNECTED");
                                                            // Prepare for Reconnect
                                                            if (brokerAccount) {
                                                                setLoginId(brokerAccount.login);
                                                                setSelectedServer(brokerAccount.server);
                                                                setSearch(brokerAccount.server);
                                                            }
                                                            setShowBrokerForm(true);
                                                        } else {
                                                            toast.error("Failed to disconnect", { id: confirmId, description: res.error });
                                                        }
                                                    }}
                                                    className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors opacity-60 hover:opacity-100"
                                                >
                                                    <LogOut size={12} /> Disconnect
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    !showBrokerForm ? (
                                        <div
                                            className="bg-[#1A1D25] border border-white/5 p-5 rounded-2xl cursor-pointer hover:border-blue-500/40 hover:bg-[#1f232e] transition-all group relative overflow-hidden"
                                            onClick={() => setShowBrokerForm(true)}
                                        >
                                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Settings size={60} />
                                            </div>

                                            <div className="flex items-center gap-4 mb-4 relative z-10">
                                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:bg-orange-500/20 transition-colors">
                                                    <Settings className="text-orange-500" size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors">Connect Broker</h3>
                                                    <p className="text-[11px] text-gray-400">Link your MT5 account to trade.</p>
                                                </div>
                                            </div>
                                            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all relative z-10">Link Account</button>
                                        </div>
                                    ) : (
                                        <div className="bg-[#15171e] border border-white/10 p-5 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-sm font-bold text-white flex items-center gap-2"><div className="w-1 h-4 bg-orange-500 rounded-full"></div> Link MT5 Account</h3>
                                                <button onClick={() => setShowBrokerForm(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                                            </div>

                                            {/* Server Search */}
                                            <div className="relative space-y-1">
                                                <label className="text-[10px] text-gray-400 font-bold uppercase">Broker Server</label>
                                                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-gray-600" placeholder="Search Server..." value={search} onFocus={() => setShowSuggestions(true)} onChange={(e) => { setSearch(e.target.value); setSelectedServer(""); setShowSuggestions(true); }} />
                                                {showSuggestions && <div className="absolute top-full left-0 w-full bg-[#1A1D25] border border-white/10 rounded-xl mt-1 max-h-40 overflow-y-auto z-20 shadow-xl">{filteredBrokers.map((b, i) => <div key={i} className="p-3 text-xs hover:bg-white/5 cursor-pointer text-gray-300 border-b border-white/5 last:border-0" onClick={() => handleSelectServer(b)}>{b}</div>)}</div>}
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 font-bold uppercase">Login ID</label>
                                                <input
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-gray-600"
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="Enter MT5 Login"
                                                    value={loginId}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (/^\d*$/.test(val)) setLoginId(val);
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 font-bold uppercase">Password</label>
                                                <div className="relative">
                                                    <input
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-gray-600 pr-10"
                                                        type={showPassword ? "text" : "password"}
                                                        placeholder="Enter Password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                    />
                                                    <button
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                    >
                                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <button onClick={handleConnectBroker} disabled={isConnecting} className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-3.5 rounded-xl shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all">
                                                {isConnecting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "Connect Now"}
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider pl-1">Role</label>
                                {role === "FOLLOWER" ? (
                                    <div className="bg-gradient-to-br from-purple-900/20 to-purple-900/10 border border-purple-500/20 p-5 rounded-2xl relative overflow-hidden group">
                                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
                                        <div className="flex items-center gap-4 mb-4 relative z-10">
                                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                                                <Briefcase className="text-purple-400" size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-purple-200">Become Master</h3>
                                                <p className="text-[11px] text-purple-300/60">Earn from followers copying you.</p>
                                            </div>
                                        </div>
                                        <button onClick={handleBecomeMaster} className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3.5 rounded-xl shadow-lg shadow-purple-600/20 transition-all relative z-10 transform active:scale-[0.98]">Activate Master Mode</button>
                                    </div>
                                ) : (
                                    <div className="bg-[#1A1D25] border border-white/5 p-5 rounded-2xl">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                                <UserCircle2 className="text-blue-400" size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white">You are a Master</h3>
                                                <p className="text-[11px] text-gray-400">Follower functionalities disabled.</p>
                                            </div>
                                        </div>
                                        <button onClick={handleDowngrade} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 text-xs font-bold py-3 rounded-xl transition-all">Switch to Follower View</button>
                                    </div>
                                )}
                            </div>

                            {/* 🛠️ DEV TOOL: VIP Toggle */}
                            <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[10px] text-gray-500 flex items-center gap-2"><Crown size={12} /> [Dev] Simulate VIP</span>
                                <div
                                    className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${isVip ? "bg-yellow-500" : "bg-gray-700"}`}
                                    onClick={() => setIsVip(!isVip)}
                                >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${isVip ? "left-6" : "left-1"}`}></div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <MasterProfileEditor onClose={onClose} role={role} profile={profile} setProfile={setProfile} userImage={user?.image} openConfirm={openConfirm} />
                    )}
                </div>
            </Card>
        </div>
    )
}
