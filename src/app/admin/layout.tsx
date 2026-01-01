"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, Users, CreditCard, ShieldAlert, BarChart3, LogOut, ShieldCheck, ArrowRight,
    Menu, X, Command, LifeBuoy, Send, SquareUser, ChevronRight, Settings, FolderKanban,
    PanelLeft, Search, Home, LineChart, PieChart, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === "admin888") {
            setIsAuthenticated(true);
            toast.success("Welcome, Administrator");
        } else {
            setError(true);
            setTimeout(() => setError(false), 500);
            toast.error("Access Denied");
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 selection:bg-blue-500 selection:text-white">
                <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-blue-600/20 text-blue-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-blue-500/30 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]">
                            <ShieldCheck size={40} />
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Admin Portal</h1>
                        <p className="text-gray-500 mt-2">Secure System Management</p>
                    </div>

                    <form onSubmit={handleLogin} className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 p-8 rounded-3xl shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Access Key</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`w-full bg-gray-950 border-2 rounded-xl py-4 px-5 text-white placeholder-gray-600 outline-none transition-all text-lg tracking-widest ${error ? "border-red-500/50 bg-red-900/10" : "border-gray-800 focus:border-blue-500 focus:bg-gray-900"}`}
                                placeholder="••••••••"
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 group"
                        >
                            <span>Verify Access</span>
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </form>

                    <p className="text-center text-gray-600 text-xs mt-8">
                        Restricted Access • IP logged
                    </p>
                </div>
            </div>
        );
    }

    // Standard User Mock
    const user = {
        name: "Admin User",
        email: "admin@socialtrade.com",
        avatar: "AD"
    };

    const breadcrumbs = pathname.split('/').filter(Boolean).filter(p => p !== 'admin').map(p => p.charAt(0).toUpperCase() + p.slice(1));

    return (
        <div className="flex h-screen bg-gray-950 text-gray-200 font-sans overflow-hidden">
            {/* 
              ========================================
              DESKTOP SIDEBAR 
              ========================================
            */}
            <aside className="w-[280px] bg-gray-900/50 border-r border-gray-800 flex flex-col hidden md:flex backdrop-blur-xl">
                {/* 1. Header (App Switcher) */}
                <div className="p-4 border-b border-gray-800/50">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group border border-transparent hover:border-gray-700">
                        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20">
                            <Command className="size-4" />
                        </div>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-bold text-white tracking-tight">Social Trading</span>
                            <span className="truncate text-xs text-gray-400">Enterprise</span>
                        </div>
                        <ChevronRight className="ml-auto size-4 text-gray-500" />
                    </div>
                </div>

                {/* 2. Search Mock */}
                <div className="px-4 pt-4">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-gray-500 text-sm">
                        <Search size={14} />
                        <span>Search...</span>
                        <div className="ml-auto text-[10px] font-mono bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">⌘K</div>
                    </div>
                </div>

                {/* 3. Navigation Content */}
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-hide">

                    {/* Platform Group */}
                    <div className="space-y-1">
                        <h4 className="px-3 text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Platform</h4>
                        <NavItem href="/admin" icon={<LayoutDashboard size={18} />} label="Dashboard" active={pathname === "/admin"} />
                        <NavItem href="/admin/users" icon={<Users size={18} />} label="User Management" active={pathname === "/admin/users"} />
                        <NavItem href="/admin/finance" icon={<Wallet size={18} />} label="Financials" active={pathname === "/admin/finance"} />
                        <NavItem href="/admin/analytics" icon={<LineChart size={18} />} label="Analytics" active={pathname === "/admin/analytics"} />
                    </div>

                    {/* Support Group */}
                    <div className="space-y-1">
                        <h4 className="px-3 text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">System</h4>
                        <NavItem href="/admin/health" icon={<ShieldAlert size={18} />} label="Health Status" active={pathname === "/admin/health"} />
                        <NavItem href="#" icon={<FolderKanban size={18} />} label="Audit Logs" />
                        <NavItem href="#" icon={<Settings size={18} />} label="Settings" />
                    </div>
                </div>

                {/* 4. Footer (User) */}
                <div className="p-4 border-t border-gray-800/50">
                    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer group mb-2 border border-transparent hover:border-gray-700">
                        <div className="h-9 w-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:bg-gray-700 group-hover:text-white transition-colors">
                            {user.avatar}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-white truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <LogOut
                            size={16}
                            className="text-gray-500 group-hover:text-red-400 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAuthenticated(false);
                            }}
                        />
                    </div>
                </div>
            </aside>

            {/* 
              ========================================
              MOBILE OVERLAY (DRAWER)
              ========================================
            */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[100] md:hidden">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <aside className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[300px] bg-gray-900 border-r border-gray-800 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                            <div className="flex items-center gap-2">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-black font-bold">
                                    <Command className="size-4 text-white" />
                                </div>
                                <span className="font-bold text-white">Admin Panel</span>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="bg-gray-800 p-2 rounded-lg text-gray-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
                            {/* Mobile Nav Content */}
                            <div className="space-y-1">
                                <h4 className="px-3 text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Platform</h4>
                                <NavItem onClick={() => setIsMobileMenuOpen(false)} href="/admin" icon={<LayoutDashboard size={18} />} label="Dashboard" active={pathname === "/admin"} />
                                <NavItem onClick={() => setIsMobileMenuOpen(false)} href="/admin/users" icon={<Users size={18} />} label="User Management" active={pathname === "/admin/users"} />
                                <NavItem onClick={() => setIsMobileMenuOpen(false)} href="/admin/finance" icon={<Wallet size={18} />} label="Financials" active={pathname === "/admin/finance"} />
                            </div>
                            <div className="space-y-1">
                                <h4 className="px-3 text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">System</h4>
                                <NavItem onClick={() => setIsMobileMenuOpen(false)} href="/admin/health" icon={<ShieldAlert size={18} />} label="Health Status" active={pathname === "/admin/health"} />
                                <NavItem onClick={() => setIsMobileMenuOpen(false)} href="#" icon={<Settings size={18} />} label="Settings" />
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                            <button onClick={() => setIsAuthenticated(false)} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-all font-medium text-sm">
                                <LogOut size={16} />
                                <span>Logout</span>
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {/* 
              ========================================
              MAIN CONTENT AREA 
              ========================================
            */}
            <main className="flex-1 overflow-hidden flex flex-col relative bg-gray-950">

                {/* TOP HEADER (Breadcrumbs + Sidebar Trigger) */}
                <header className="h-16 border-b border-gray-800 flex items-center px-4 md:px-6 gap-4 bg-gray-900/20 backdrop-blur-sm sticky top-0 z-40">

                    {/* Mobile Menu Trigger */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <PanelLeft size={20} />
                    </button>



                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        {breadcrumbs.map((crumb, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className={cn("transition-colors flex items-center gap-2", i === breadcrumbs.length - 1 ? "text-white font-medium" : "hidden sm:block hover:text-gray-300 cursor-pointer")}>
                                    {crumb}
                                    {i < breadcrumbs.length - 1 && <ChevronRight size={14} />}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Top Right Actions */}
                    <div className="ml-auto flex items-center gap-4">
                        <Link href="/" className="text-xs font-medium text-gray-400 hover:text-blue-400 flex items-center gap-1 transition-colors border border-gray-800 rounded-md px-3 py-1.5 hover:bg-gray-800">
                            Exit to App <ArrowRight size={12} />
                        </Link>
                    </div>
                </header>

                {/* SCROLLABLE PAGE CONTENT */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                    <div className="max-w-7xl mx-auto min-h-full animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

function NavItem({ href, icon, label, active = false, onClick }: { href: string; icon: React.ReactNode; label: string; active?: boolean, onClick?: () => void }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium group relative overflow-hidden",
                active
                    ? "text-white bg-blue-600 shadow-md shadow-blue-900/20"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/50"
            )}
        >
            <span className={cn("transition-colors", active ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>{icon}</span>
            <span>{label}</span>
        </Link>
    );
}
