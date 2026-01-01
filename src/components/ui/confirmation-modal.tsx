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

    let icon = <AlertTriangle className="text-blue-500" size={24} />;
    let confirmBtnClass = "bg-blue-600 hover:bg-blue-500 text-white";

    if (type === "danger") {
        icon = <AlertTriangle className="text-red-500" size={24} />;
        confirmBtnClass = "bg-red-600 hover:bg-red-500 text-white";
    } else if (type === "success") {
        icon = <CheckCircle2 className="text-green-500" size={24} />;
        confirmBtnClass = "bg-green-600 hover:bg-green-500 text-white";
    } else if (type === "warning") {
        icon = <AlertTriangle className="text-yellow-500" size={24} />;
        confirmBtnClass = "bg-yellow-600 hover:bg-yellow-500 text-black";
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
            <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full bg-gray-800/50`}>
                            {icon}
                        </div>
                        <h3 className="font-bold text-lg text-white">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 text-center space-y-4">
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-800 bg-gray-950/30 flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white rounded-xl py-6 font-bold transition-colors">
                        {cancelText}
                    </button>
                    <button onClick={() => { onConfirm(); onClose(); }} className={`flex-1 rounded-xl py-6 font-bold shadow-lg transition-transform active:scale-95 ${confirmBtnClass}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
