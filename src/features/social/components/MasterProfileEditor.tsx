
import React, { useState } from "react";
import { Info, Image as ImageIcon, CheckCircle2, DollarSign, X, Edit3, Save, Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";
import { UserRole, MasterProfile, Master } from "@/types";
import { MasterProfileView } from "@/features/social/components/MasterProfileView";
import { forceStopMasterSessions } from "@/app/actions/trade";
// import { updateMasterProfile } from "@/app/actions/user"; // ✅ Removed, handled by parent


interface MasterProfileEditorProps {
    onClose: () => void;
    role: UserRole;
    profile: MasterProfile;
    setProfile: (p: MasterProfile) => void;
    userImage?: string | null;
    openConfirm?: (title: string, message: string, onConfirm: () => void, type?: "info" | "danger" | "success" | "warning") => void;
}

export function MasterProfileEditor({ onClose, role, profile, setProfile, userImage, openConfirm }: MasterProfileEditorProps) {
    const [avatar, setAvatar] = useState(profile.avatar);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1024 * 1024) { // 1MB limit
                alert("File size must be less than 1MB");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const [name, setName] = useState(profile.name);
    const [username, setUsername] = useState(profile.username || ""); // ✅ Username State
    const [desc, setDesc] = useState(profile.desc);
    const [tags, setTags] = useState<string[]>(profile.tags);
    const [tagInput, setTagInput] = useState("");
    const [fee, setFee] = useState<number | string>(profile.monthlyFee);
    const [minDeposit, setMinDeposit] = useState<number | string>(profile.minDeposit || 10);
    const [winRate, setWinRate] = useState<number | string>(profile.winRate || 0);
    const [roi, setRoi] = useState<number | string>(profile.roi || 0);
    const [riskReward, setRiskReward] = useState<number | string>(profile.riskReward || 0);

    const [isPaid, setIsPaid] = useState(profile.monthlyFee > 0);
    const [isPublic, setIsPublic] = useState(profile.isPublic ?? true);
    const [isSaving, setIsSaving] = useState(false); // ✅ Saving State

    const togglePaid = (paid: boolean) => {
        setIsPaid(paid);
        if (!paid) setFee(0);
    };

    const togglePrivacy = () => {
        const newValue = !isPublic;
        // If switching from Public -> Private, show warning
        if (!newValue && openConfirm) {
            openConfirm(
                "Go Private & Stop Followers?",
                "⚠️ Switching to Private will STOP all active followers immediately.\nThey will be refunded for any remaining time/fees if applicable.",
                async () => {
                    // Force Stop logic
                    const res = await forceStopMasterSessions(profile.userId);
                    if (res.success) {
                        toast.success("All followers stopped.");
                        setIsPublic(false);
                    } else {
                        toast.error("Failed to stop followers", { description: res.error });
                    }
                },
                "danger"
            );
        } else {
            setIsPublic(newValue);
        }
    };

    const addTag = () => {
        if (tagInput && tags.length < 5) {
            setTags([...tags, tagInput]);
            setTagInput("");
        }
    };

    const removeTag = (index: number) => {
        setTags(tags.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setIsSaving(true);
        if (!profile.userId) {
            toast.error("Save Failed", { description: "User ID is missing." });
            setIsSaving(false);
            return;
        }

        const safeFee = isNaN(Number(fee)) ? 0 : Number(fee);
        const safeMinDeposit = isNaN(Number(minDeposit)) ? 10 : Number(minDeposit);
        const safeWinRate = isNaN(Number(winRate)) ? 0 : Number(winRate);
        const safeRoi = isNaN(Number(roi)) ? 0 : Number(roi);

        const updatedProfile = {
            ...profile,
            name,
            username,
            desc,
            tags,
            avatar: avatar,
            monthlyFee: safeFee,
            minDeposit: safeMinDeposit,
            winRate: safeWinRate,
            roi: safeRoi,
            isPublic: isPublic
        };

        // Delegate to Parent (SocialTradingApp) which handles:
        // 1. Optimistic Update (setMasterProfile)
        // 2. Server Persistence (updateMasterProfile)
        // 3. Toasts (Success/Error)
        await setProfile(updatedProfile);

        // Close Editor immediately (Parent handles feedback)
        onClose();
        setIsSaving(false);
    };



    return (
        <div className="space-y-4 animate-in fade-in">

            {/* 1. Header: Avatar Centered */}
            <div className="text-center mb-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full border-2 border-gray-700 relative mb-1 group cursor-pointer" onClick={handleAvatarClick}>
                    <img
                        src={avatar || userImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ImageIcon className="text-white" size={16} />
                    </div>
                </div>
                <p className="text-[10px] text-gray-500 cursor-pointer hover:text-purple-400 transition-colors" onClick={handleAvatarClick}>Tap to change</p>
            </div>

            {/* 2. Grid: Name & Min Invest */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-bold uppercase">Display Name</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:border-purple-500 outline-none"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">Min Invest</label>
                    <div className="relative">
                        <DollarSign size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
                        <input
                            type="number"
                            value={minDeposit}
                            onChange={(e) => setMinDeposit(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2.5 pl-8 pr-2 text-xs text-white focus:border-purple-500 outline-none font-mono"
                            placeholder="10"
                        />
                    </div>
                </div>
            </div>

            {/* 3. Username & Share Link */}
            <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Username & Link</label>
                <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center bg-gray-950 border border-gray-700 rounded-lg overflow-hidden focus-within:border-purple-500 transition-colors">
                        <span className="pl-3 pr-1 text-xs text-gray-500 font-mono select-none">copy.trade/</span>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="flex-1 bg-transparent p-2.5 pl-0 text-xs text-white outline-none placeholder:text-gray-700 font-mono"
                            placeholder="username"
                        />
                    </div>
                    <button
                        onClick={() => {
                            const url = `https://copy.trade/${username || "username"}`;
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(url);
                                toast.success("Link copied!");
                            } else {
                                toast.success("Link copied!");
                            }
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-lg shadow-sm transition-all active:scale-95"
                    >
                        <Copy size={14} />
                    </button>
                </div>
            </div>

            {/* 4. Bio */}
            <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Strategy Bio</label>
                <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-xs text-white h-16 focus:border-purple-500 outline-none resize-none"
                    placeholder="Short description..."
                />
            </div>

            {/* 5. Tags */}
            <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Tags (Max 5)</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {tags.map((t, i) => (
                        <span key={i} className="bg-purple-900/40 text-purple-300 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-500/30">
                            {t} <X size={10} className="cursor-pointer hover:text-white" onClick={() => removeTag(i)} />
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        className="flex-1 bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-purple-500 outline-none"
                        placeholder="Add tag..."
                    />
                    <button onClick={addTag} className="bg-gray-800 px-3 rounded-lg text-white hover:bg-gray-700">
                        <CheckCircle2 size={14} />
                    </button>
                </div>
            </div>

            {/* 6. Footer Action */}
            <div className="pt-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all"
                >
                    {isSaving ? "Saving..." : <><Save size={14} /> Save Changes</>}
                </button>
            </div>
        </div>
    );
}
