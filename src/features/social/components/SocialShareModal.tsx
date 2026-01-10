
import React, { useRef } from "react";
import { X, Copy, Download, Share2, TrendingUp, Users, ShieldCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { Master } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toPng } from "html-to-image";

interface SocialShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    master: Master;
    stats?: {
        roi: number;
        aum: number;
        copiers: number;
        drawdown: number;
    };
}

export function SocialShareModal({ isOpen, onClose, master, stats }: SocialShareModalProps) {
    if (!isOpen) return null;

    const cardRef = useRef<HTMLDivElement>(null);
    const profileUrl = `https://copy.trade/${master.username || master.name.replace(/\s+/g, '').toLowerCase()}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(profileUrl)}&bgcolor=111&color=fff`; // Dark mode friendly QR

    const safeCopy = (text: string) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => toast.success("Link copied!"))
                .catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    };

    const fallbackCopy = (text: string) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            toast.success("Link copied!");
        } catch (err) {
            toast.error("Failed to copy link");
        }
    };

    const handleCopyLink = () => {
        safeCopy(profileUrl);
    };

    const handleDownload = async () => {
        if (!cardRef.current) return;

        try {
            const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = `${master.name}-performance.png`;
            link.href = dataUrl;
            link.click();
            toast.success("Image downloaded!");
        } catch (err) {
            console.error("Download failed", err);
            toast.error("Failed to generate image.");
        }
    };

    // Formatting helpers
    const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtCurrency = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="relative bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/2">
                    <h3 className="text-sm font-bold text-white">Share Performance</h3>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* 🎨 PREVIEW AREA (The Card) */}
                <div className="p-6 bg-[#050505] flex items-center justify-center">
                    <div
                        ref={cardRef}
                        className="relative w-full aspect-4/5 rounded-3xl overflow-hidden bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col"
                    >
                        {/* 🌟 Decorative Glows - Binance Style */}
                        <div className="absolute top-0 right-0 w-full h-[70%] bg-linear-to-b from-[#1e1b4b] to-transparent opacity-40 pointer-events-none"></div>
                        <div className="absolute -top-32 -right-32 w-80 h-80 bg-purple-600/10 blur-[100px] rounded-full pointer-events-none"></div>
                        <div className="absolute bottom-0 right-0 w-full h-1/2 bg-linear-to-t from-black/90 to-transparent pointer-events-none"></div>

                        {/* CARD CONTENT */}
                        <div className="relative z-10 flex-1 p-6 flex flex-col justify-between">

                            {/* Top: Branding & Master */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-12 w-12 border-2 border-white/10 shadow-lg">
                                        <AvatarImage src={master.avatar} />
                                        <AvatarFallback className="bg-gray-800 text-white font-bold">{master.name.substring(0, 2)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h4 className="font-black text-white text-lg leading-tight">{master.name}</h4>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Master Trader</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs font-black italic text-gray-600">SOCIAL.TRADE</span>
                                </div>
                            </div>

                            {/* Middle: Big Stats */}
                            <div className="space-y-6 mt-4">
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Return</div>
                                    <div className={`text-5xl font-black text-transparent bg-clip-text ${((stats?.roi ?? master.roi ?? 0) >= 0) ? "bg-linear-to-r from-green-400 to-emerald-500 drop-shadow-[0_0_15px_rgba(74,222,128,0.3)]" : "bg-linear-to-r from-red-400 to-red-600 drop-shadow-[0_0_15px_rgba(248,113,113,0.3)]"}`}>
                                        {((stats?.roi ?? master.roi ?? 0) > 0 ? "+" : "")}{fmt(stats?.roi ?? master.roi ?? 0)}%
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Copiers</div>
                                        <div className="text-sm font-bold text-white max-w-[80px] truncate" title={master.desc}>{stats?.copiers || master.followers.toLocaleString()}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Drawdown</div>
                                        <div className="text-sm font-bold text-rose-400">{fmt(stats?.drawdown || master.drawdown || 0)}%</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Monthly Profit</div>
                                        <div className="flex items-center gap-1 text-sm font-bold text-blue-400">
                                            <TrendingUp size={14} />
                                            {master.monthlyProfit ?? 0}%
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom: QR & CTA */}
                            <div className="flex items-end justify-between mt-auto">
                                <div className="bg-white p-1 rounded-xl shadow-lg">
                                    {/* QR Code */}
                                    <img src={qrUrl} alt="QR Code" className="w-[80px] h-[80px] rounded-lg mix-blend-multiply opacity-90" />
                                </div>
                                <div className="text-right pb-1">
                                    <p className="text-[10px] text-gray-400 mb-0.5">Scan to Copy Strategy</p>
                                    <div className="text-xs font-bold text-white bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 inline-flex items-center gap-2">
                                        Join Now <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="p-4 bg-gray-950 border-t border-white/5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            className="bg-[#111] border-white/10 hover:bg-white/5 text-xs font-bold h-11"
                            onClick={handleDownload}
                        >
                            <Download size={16} className="mr-2" />
                            Download
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-500 text-white border-0 text-xs font-bold h-11 shadow-lg shadow-blue-600/20"
                            onClick={handleCopyLink}
                        >
                            <Copy size={16} className="mr-2" />
                            Copy Link
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
}
