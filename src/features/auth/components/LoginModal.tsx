
import { useState } from "react";
import { Monitor, X, Mail, Globe, ArrowRight, ShieldCheck } from "lucide-react";

interface LoginModalProps {
    onClose: () => void;
    onLoginSuccess: () => void;
}

export function LoginModal({ onClose, onLoginSuccess }: LoginModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = () => {
        setIsLoading(true);
        // Simulate Google Social Login
        setTimeout(() => { setIsLoading(false); onLoginSuccess(); }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95">
            <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-700 shadow-2xl flex flex-col relative overflow-hidden">

                {/* Decorative Background Glow */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-600/20 to-transparent pointer-events-none"></div>

                {/* Header */}
                <div className="p-6 relative z-10 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/10">
                        <Monitor size={32} className="text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                    <p className="text-sm text-gray-400">Sign in to manage your portfolio and<br />copy top traders instantly.</p>
                </div>

                <div className="px-6 pb-6 space-y-4">
                    {/* Google Login Button */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-gray-700"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase font-bold">Or continue with</span>
                        <div className="flex-grow border-t border-gray-700"></div>
                    </div>

                    {/* Email Option */}
                    <button disabled className="w-full bg-gray-800 border border-gray-700 text-gray-400 font-bold py-4 rounded-xl flex items-center justify-center gap-3 cursor-not-allowed opacity-75">
                        <Mail size={18} />
                        Sign in with Email
                    </button>

                    <p className="text-[10px] text-gray-600 text-center mt-2 flex items-center justify-center gap-1">
                        <ShieldCheck size={10} />
                        Bank-grade security & encryption
                    </p>
                </div>

                <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-gray-400 hover:text-white hover:bg-black/40 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>
    )
}
