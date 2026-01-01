
import React, { useState } from "react";
import { Info, Image as ImageIcon, CheckCircle2, DollarSign, X, Edit3, Save } from "lucide-react";
import { UserRole, MasterProfile, Master } from "@/types";
import { MasterProfileView } from "@/features/social/components/MasterProfileView";

interface MasterProfileEditorProps {
    onClose: () => void;
    role: UserRole;
    profile: MasterProfile;
    setProfile: (p: MasterProfile) => void;
}

export function MasterProfileEditor({ onClose, role, profile, setProfile }: MasterProfileEditorProps) {
    const [name, setName] = useState(profile.name);
    const [desc, setDesc] = useState(profile.desc);
    const [tags, setTags] = useState<string[]>(profile.tags);
    const [tagInput, setTagInput] = useState("");
    const [fee, setFee] = useState<number | string>(profile.monthlyFee);
    const [isPaid, setIsPaid] = useState(profile.monthlyFee > 0);
    const [previewMode, setPreviewMode] = useState(false);

    const togglePaid = (paid: boolean) => {
        setIsPaid(paid);
        if (!paid) setFee(0);
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

    const handleSave = () => {
        setProfile({
            ...profile,
            name,
            desc,
            tags,
            monthlyFee: Number(fee)
        });
        onClose();
    };

    const previewData: Master = {
        id: 999,
        name,
        desc,
        tags,
        avatar: profile.avatar,
        pnlText: "+$12,450",
        followers: 5420,
        risk: 6,
        winRate: 88,
        drawdown: 18.2,
        profitFactor: 2.1,
        type: "HUMAN",
        isVip: true,
        joined: "2022",
        currentOrders: [],
        monthlyFee: Number(fee),
        isPremium: Number(fee) > 0,
        balance: 10000,
        roi: 89
    };

    if (previewMode) return <MasterProfileView master={previewData} onBack={() => setPreviewMode(false)} isPreview={true} requireAuth={() => { }} onStartCopy={() => { }} onStopCopy={() => { }} />;

    return (
        <div className="space-y-6 animate-in fade-in">
            {role === "FOLLOWER" && <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl flex gap-2 items-start"><Info size={16} className="text-blue-400 mt-0.5" /><p className="text-[10px] text-blue-200">You are editing your <b>Draft Profile</b>. This will be public once you activate Master Mode.</p></div>}
            <div className="text-center mb-4"><div className="w-20 h-20 mx-auto bg-gray-800 rounded-full border-2 border-gray-700 relative mb-2"><img src={profile.avatar} alt="Avatar" className="w-full h-full rounded-full" /><button className="absolute bottom-0 right-0 bg-purple-600 p-1.5 rounded-full text-white border-2 border-gray-900"><ImageIcon size={12} /></button></div><p className="text-xs text-gray-500">Tap to change avatar</p></div>
            <div className="space-y-2"><label className="text-xs text-gray-400">Display Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-purple-500 outline-none" /></div>

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
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-800"><button onClick={() => setPreviewMode(true)} className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2"><Edit3 size={16} /> Preview</button><button onClick={handleSave} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"><Save size={16} /> Save Changes</button></div>
        </div>
    );
}
