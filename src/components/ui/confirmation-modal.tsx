import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "danger" | "info" | "success" | "warning";
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = "info"
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    // 🎨 Leonardo Theme Mappings
    let icon = <AlertTriangle className="text-neon-cyan drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" size={28} />;
    let glowColor = "bg-neon-cyan/20";
    let confirmBtnClass = "bg-neon-cyan hover:bg-cyan-400 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]";

    if (type === "danger") {
        icon = <AlertTriangle className="text-destructive drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" size={28} />;
        glowColor = "bg-destructive/20";
        confirmBtnClass = "bg-destructive hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]";
    } else if (type === "success") {
        icon = <CheckCircle2 className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" size={28} />;
        glowColor = "bg-emerald-500/20";
        confirmBtnClass = "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_15px_rgba(52,211,153,0.4)]";
    } else if (type === "warning") {
        icon = <AlertTriangle className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" size={28} />;
        glowColor = "bg-amber-500/20";
        confirmBtnClass = "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(251,191,36,0.4)]";
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-[#0b0c14] border border-white/10 w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden relative group">

                {/* 🌟 Ambient Glow Effect */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 ${glowColor} blur-xl group-hover:blur-2xl transition-all duration-700`}></div>

                {/* Header */}
                <div className="p-6 pb-0 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl bg-white/5 border border-white/5 ${glowColor} backdrop-blur-xl`}>
                            {icon}
                        </div>
                        <h3 className="font-bold text-xl text-white tracking-tight">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 pt-4 text-left">
                    <p className="text-gray-400 text-[15px] leading-relaxed font-medium whitespace-pre-line">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="p-6 pt-2 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 text-gray-300 hover:text-white rounded-xl py-4 font-bold transition-all text-sm tracking-wide"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`flex-1 rounded-xl py-4 font-bold transition-all active:scale-95 text-sm tracking-wide ${confirmBtnClass}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
