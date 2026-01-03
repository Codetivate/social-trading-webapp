
import React, { useState } from "react";
import { Info, Image as ImageIcon, CheckCircle2, DollarSign, X, Edit3, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { UserRole, MasterProfile, Master } from "@/types";
import { MasterProfileView } from "@/features/social/components/MasterProfileView";
import { forceStopMasterSessions } from "@/app/actions/trade";
import { updateMasterProfile } from "@/app/actions/user"; // ✅ Import Save Action

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
    const [desc, setDesc] = useState(profile.desc);
    const [tags, setTags] = useState<string[]>(profile.tags);
    const [tagInput, setTagInput] = useState("");
    const [fee, setFee] = useState<number | string>(profile.monthlyFee);
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
        const updatedProfile = {
            ...profile,
            name,
            desc,
            tags,
            avatar: avatar,
            monthlyFee: Number(fee),
            isPublic: isPublic
        };

        // 1. Optimistic Update
        setProfile(updatedProfile);

        // 2. Server Persistence
        const res = await updateMasterProfile(profile.userId, {
            name, desc, tags, avatar, monthlyFee: Number(fee), isPublic
        });

        if (res.success) {
            toast.success("Profile Updated", { description: "Your changes have been saved." });
            onClose();
        } else {
            toast.error("Save Failed", { description: res.error });
            // Revert state? Ideally yes, but keeping simple for now
        }
        setIsSaving(false);
    };



    return (
        <div className="space-y-6 animate-in fade-in">

            <div className="text-center mb-4">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                <div className="w-20 h-20 mx-auto bg-gray-800 rounded-full border-2 border-gray-700 relative mb-2 group cursor-pointer" onClick={handleAvatarClick}>
                    <img
                        src={avatar || userImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ImageIcon className="text-white" size={20} />
                    </div>
                    <button className="absolute bottom-0 right-0 bg-purple-600 p-1.5 rounded-full text-white border-2 border-gray-900 shadow-sm">
                        <Edit3 size={10} />
                    </button>
                </div>
                <p className="text-xs text-gray-500 cursor-pointer hover:text-purple-400 transition-colors" onClick={handleAvatarClick}>Tap to change avatar</p>
            </div>

            <div className="space-y-2"><label className="text-xs text-gray-400">Display Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-purple-500 outline-none" /></div>

            {/* 🔒 PRIVACY SETTING */}
            <div className="space-y-2">
                <label className="text-xs text-gray-400 font-bold uppercase">Profile Visibility</label>
                <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${isPublic ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {isPublic ? <Eye size={20} /> : <EyeOff size={20} />}
                        </div>
                        <div>
                            <h4 className={`text-sm font-bold ${isPublic ? 'text-green-400' : 'text-red-400'}`}>{isPublic ? "Public Profile" : "Private Mode"}</h4>
                            <p className="text-[10px] text-gray-400">{isPublic ? "Visible to everyone. Copiers allowed." : "Hidden from lists. Copying disabled."}</p>
                        </div>
                    </div>
                    <button
                        onClick={togglePrivacy}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isPublic ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                    >
                        {isPublic ? "Set Private" : "Set Public"}
                    </button>
                </div>
            </div>

            {/* 💰 Fee Setting (Updated UI) */}
            <div className="space-y-2">
                <label className="text-xs text-gray-400 font-bold uppercase">Subscription Model</label>
                <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-700">
                    <button onClick={() => togglePaid(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isPaid ? 'bg-green-600 text-white shadow' : 'text-gray-500 hover:text-white'}`}>Free</button>
                    <button onClick={() => togglePaid(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isPaid ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-white'}`}>Paid</button>
                </div>

                {isPaid && (
                    <div className="animate-in slide-in-from-top-2 pt-2">
                        <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">Monthly Fee (USD)</label>
                        <div className="relative">
                            <DollarSign size={16} className="absolute left-3 top-3 text-green-500" />
                            <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-xl py-3 pl-10 pr-3 text-sm text-white focus:border-green-500 outline-none font-mono" placeholder="10" />
                        </div>
                        <p className="text-[10px] text-blue-400 text-right mt-1">Platform fee 20% will be deducted.</p>
                    </div>
                )}
            </div>

            <div className="space-y-2"><label className="text-xs text-gray-400">Bio / Strategy Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm text-white h-24 focus:border-purple-500 outline-none resize-none" placeholder="Describe your strategy..." /></div>
            <div className="space-y-2"><label className="text-xs text-gray-400">Strategy Tags (Max 5)</label><div className="flex flex-wrap gap-2 mb-2">{tags.map((t, i) => (<span key={i} className="bg-purple-900/40 text-purple-300 text-xs px-2 py-1 rounded-lg flex items-center gap-1 border border-purple-500/30">{t} <X size={12} className="cursor-pointer hover:text-white" onClick={() => removeTag(i)} /></span>))}</div><div className="flex gap-2"><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} className="flex-1 bg-gray-950 border border-gray-700 rounded-xl p-3 text-xs text-white focus:border-purple-500 outline-none" placeholder="Type tag & press Enter..." /><button onClick={addTag} className="bg-gray-800 px-4 rounded-xl text-white hover:bg-gray-700"><CheckCircle2 size={16} /></button></div></div>
            <div className="grid grid-cols-1 gap-3 pt-4 border-t border-gray-800"><button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20">{isSaving ? "Saving..." : <><Save size={16} /> Save Changes</>}</button></div>
        </div>
    );
}
