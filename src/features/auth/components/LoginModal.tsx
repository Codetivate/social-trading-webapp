import { useState } from "react";
import { X, Sparkles, ShieldCheck } from "lucide-react";
import { signIn } from "next-auth/react";

interface LoginModalProps {
    onClose: () => void;
    onLoginSuccess: () => void;
}

export function LoginModal({ onClose, onLoginSuccess }: LoginModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await signIn("google", { callbackUrl: "/" });
            // onLoginSuccess typically won't run if redirect happens, but just in case
        } catch (error) {
            console.error("Login Failed", error);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-sm bg-gray-950 border border-white/10 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/5 mx-auto animate-in zoom-in-95 duration-300 slide-in-from-bottom-5">

                {/* 🌟 Ambient Glow Effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-48 bg-blue-600/20 blur-[80px] rounded-full pointer-events-none opacity-50"></div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-20"
                >
                    <X size={20} />
                </button>

                <div className="relative z-10 flex flex-col items-center justify-center p-8 text-center pt-12">

                    {/* Animated Icon */}
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] animate-pulse-slow">
                        {/* Custom Signal Logo SVG */}
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 drop-shadow-lg">
                            <rect width="40" height="40" rx="12" fill="#FFFFFF" />
                            <path d="M10 20H15L19 9L23 31L27 20H30" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">SignalTrade</h2>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed max-w-[240px]">
                        Sign in to access your portfolio and follow expert signals instantly.
                    </p>

                    {/* Google Button - High Contrast (Netflix/Apple Style) */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full group relative bg-white hover:bg-gray-100 text-black font-bold h-12 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.4)]"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                <span className="font-bold -tracking-tight">Continue with Google</span>
                            </>
                        )}
                    </button>


                </div>
            </div>
        </div>
    );
}
