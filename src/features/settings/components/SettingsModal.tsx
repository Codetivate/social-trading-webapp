
import React, { useState } from "react";
import { Settings, X, LogOut, Briefcase, UserCircle2, Crown } from "lucide-react";
import { toast } from "sonner";
import { UserRole, AccountStatus, Session, MasterProfile } from "@/types";
import { MasterProfileEditor } from "@/features/social/components/MasterProfileEditor";
import { CURRENT_USER_DATA } from "@/lib/mock-data";

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
    activeSessions: Session[];
    onStopAll: () => void;
    profile: MasterProfile;
    setProfile: (p: MasterProfile) => void;
    onRequestActivation: () => void;
    openConfirm: (title: string, message: string, onConfirm: () => void, type?: "info" | "danger" | "success" | "warning") => void;
    defaultShowBroker?: boolean;
}

export function SettingsModal({ onClose, status, setStatus, role, setRole, setViewMode, onLogout, isVip, setIsVip, activeSessions, onStopAll, profile, setProfile, onRequestActivation, openConfirm, defaultShowBroker = false }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<"ACCOUNT" | "PROFILE">("ACCOUNT");

    // 🔥 ROLE SWITCH LOGIC
    const handleBecomeMaster = () => {
        // 🔒 CHECK: BROKER CONNECTION
        if (status !== "CONNECTED") {
            // If check only inside settings, we can just highlight the broker form
            toast.error("Broker Not Connected", { description: "Please connect your MT5 Broker Account first!" });
            setShowBrokerForm(true);
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
        onClose(); // Close settings
        onRequestActivation(); // Trigger activation modal in parent
    };

    const handleDowngrade = () => {
        openConfirm(
            "Switch back to Follower mode?",
            "⚠️ Warning: Your Master broadcasting will completely STOP.\n\n💰 Any active subscribers will be automatically refunded for the remaining period.",
            () => {
                setRole("FOLLOWER");
                setViewMode("FOLLOWER");
                onClose();
            },
            "danger"
        );
    }

    const handleLogout = () => {
        openConfirm("Logout", "Are you sure you want to logout?", () => onLogout(), "danger");
    };

    // --- BROKER CONNECTION LOGIC ---
    const [isConnecting, setIsConnecting] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedServer, setSelectedServer] = useState("");
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [showBrokerForm, setShowBrokerForm] = useState(defaultShowBroker);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // MOCK DATA Reuse
    const MOCK_BROKERS = ["Exness-MT5Real", "Exness-MT5Trial", "XMGlobal-MT5-Real", "ICMarkets-MT5-Live", "Pepperstone-MT5-01"];
    const filteredBrokers = MOCK_BROKERS.filter(b => b.toLowerCase().includes(search.toLowerCase()));

    const handleConnectBroker = () => {
        if (!selectedServer || !loginId || !password) {
            alert("Please fill all fields"); // Ideally use toast
            return;
        }
        setIsConnecting(true);
        setTimeout(() => {
            setIsConnecting(false);
            setStatus("CONNECTED"); // Update parent status
            setShowBrokerForm(false);
            // reset form
            setLoginId(""); setPassword(""); setSelectedServer("");
        }, 1500);
    }

    const handleSelectServer = (server: string) => {
        setSelectedServer(server);
        setSearch(server);
        setShowSuggestions(false);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in fade-in"><div className="bg-gray-900 w-full max-w-md rounded-3xl border border-gray-800 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"><div className="p-5 border-b border-gray-800 flex justify-between items-center"><h2 className="text-lg font-bold flex items-center gap-2"><Settings size={18} /> {activeTab === "PROFILE" ? "Edit Profile" : "Settings"}</h2><button onClick={onClose} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={16} /></button></div>
            <div className="flex border-b border-gray-800"><button onClick={() => setActiveTab("ACCOUNT")} className={`flex-1 py-3 text-xs font-bold ${activeTab === "ACCOUNT" ? "text-white border-b-2 border-purple-500" : "text-gray-500"}`}>Account</button><button onClick={() => setActiveTab("PROFILE")} className={`flex-1 py-3 text-xs font-bold ${activeTab === "PROFILE" ? "text-white border-b-2 border-purple-500" : "text-gray-500"}`}>Public Profile {role === "FOLLOWER" && "(Draft)"}</button></div>
            <div className="p-5">
                {activeTab === "ACCOUNT" ? (
                    <div className="space-y-6">
                        {/* 🆔 APP IDENTITY (Google Account) */}
                        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <img src={CURRENT_USER_DATA.avatar} alt="Profile" className="w-10 h-10 rounded-full border border-gray-600" />
                                <div>
                                    <h3 className="text-sm font-bold text-white">{CURRENT_USER_DATA.name}</h3>
                                    <p className="text-[10px] text-gray-400 flex items-center gap-1">{CURRENT_USER_DATA.email} <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded text-[8px] border border-blue-500/20">GOOGLE</span></p>
                                </div>
                            </div>
                            <button onClick={handleLogout} className="text-gray-500 hover:text-white p-2"><LogOut size={16} /></button>
                        </div>

                        <div className="space-y-3"><label className="text-xs text-gray-500 font-bold uppercase">Broker Account</label>

                            {status === "CONNECTED" ? (
                                <div className="p-4 rounded-xl border bg-green-900/10 border-green-500/30">
                                    <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div><div><p className="font-bold text-sm">{CURRENT_USER_DATA.broker}</p><p className="text-xs text-gray-400">#{CURRENT_USER_DATA.account}</p></div></div><span className="text-[10px] font-bold px-2 py-1 rounded bg-green-500 text-black">CONNECTED</span></div>
                                    <button onClick={() => setStatus("ERROR")} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold py-2 rounded-lg border border-red-500/20 flex items-center justify-center gap-2">Disconnect</button>
                                </div>
                            ) : (
                                !showBrokerForm ? (
                                    <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl" onClick={() => setShowBrokerForm(true)}>
                                        <div className="flex items-center gap-3 mb-3"><div className="bg-orange-500/20 p-2 rounded-lg"><Settings className="text-orange-500" size={18} /></div><div><h3 className="font-bold text-sm text-white">Connect Broker</h3><p className="text-[10px] text-gray-400">Link your MT5 account to trade.</p></div></div>
                                        <button onClick={() => setShowBrokerForm(true)} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 rounded-lg">Link Account</button>
                                    </div>
                                ) : (
                                    <div className="bg-gray-950 border border-gray-700 p-4 rounded-xl space-y-3">
                                        <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-white">Link MT5 Account</h3><button onClick={() => setShowBrokerForm(false)} className="text-gray-500 hover:text-white"><X size={14} /></button></div>

                                        {/* Server Search */}
                                        <div className="relative">
                                            <input className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white" placeholder="Search Server..." value={search} onFocus={() => setShowSuggestions(true)} onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }} />
                                            {showSuggestions && <div className="absolute top-full left-0 w-full bg-gray-800 border-gray-700 max-h-32 overflow-y-auto z-10">{filteredBrokers.map((b, i) => <div key={i} className="p-2 text-xs hover:bg-gray-700 cursor-pointer text-gray-300" onClick={() => handleSelectServer(b)}>{b}</div>)}</div>}
                                        </div>
                                        <input className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white" type="number" placeholder="Login ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
                                        <input className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

                                        <button onClick={handleConnectBroker} disabled={isConnecting} className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isConnecting ? "Connecting..." : "Connect Now"}</button>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="space-y-3"><label className="text-xs text-gray-500 font-bold uppercase">Role</label>{role === "FOLLOWER" ? (<div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-xl"><div className="flex items-center gap-3 mb-3"><Briefcase className="text-purple-400" size={18} /><div><h3 className="font-bold text-sm text-purple-200">Become Master</h3><p className="text-[10px] text-gray-400">Earn from followers.</p></div></div><button onClick={handleBecomeMaster} className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3 rounded-lg">Activate Master Mode</button></div>) : (<div className="bg-gray-800 border border-gray-700 p-4 rounded-xl"><div className="flex items-center gap-3 mb-3"><UserCircle2 className="text-gray-400" size={18} /><div><h3 className="font-bold text-sm text-white">You are a Master</h3><p className="text-[10px] text-gray-400">Follower mode disabled.</p></div></div><button onClick={handleDowngrade} className="w-full border border-red-500/30 text-red-400 text-xs font-bold py-3 rounded-lg">Switch to Follower View</button></div>)}</div>

                        {/* 🛠️ DEV TOOL: VIP Toggle */}
                        <div className="pt-4 border-t border-gray-800">
                            <label className="flex items-center justify-between cursor-pointer"><span className="text-xs text-gray-400 flex items-center gap-2"><Crown size={12} /> [Dev] Simulate VIP</span><div className={`w-10 h-5 rounded-full relative transition-colors ${isVip ? "bg-yellow-500" : "bg-gray-700"}`} onClick={() => setIsVip(!isVip)}><div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isVip ? "left-6" : "left-1"}`}></div></div></label>
                        </div>
                    </div>
                ) : (
                    <MasterProfileEditor onClose={onClose} role={role} profile={profile} setProfile={setProfile} />
                )}
            </div></div></div>
    )
}
