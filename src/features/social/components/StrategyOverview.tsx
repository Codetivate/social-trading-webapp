import React from "react";
import { formatDistanceToNow } from "date-fns";
import { TrendingUp, TrendingDown, Clock, Wallet, ArrowDownLeft, ArrowUpRight, Trophy, AlertTriangle, Users } from "lucide-react";
import { AnalyticStats } from "@/app/actions/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface StrategyOverviewProps {
    stats: AnalyticStats | null;
    balance: number;
    equity: number;
    currency?: string;
}

export function StrategyOverview({ stats, balance, equity, currency = "USD" }: StrategyOverviewProps) {
    if (!stats) return null;

    const lastTradeAgo = stats.lastTradeDate && stats.lastTradeDate !== "-"
        ? formatDistanceToNow(new Date(stats.lastTradeDate), { addSuffix: true })
        : "No trades yet";

    // 🛡️ Safe Number formatting
    const fmt = (num: number, prefix = "$") => {
        return `${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. KEY METRICS ROW */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg group hover:border-[#2dd4bf]/20 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/5 blur-2xl rounded-full pointer-events-none"></div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-2 group-hover:text-teal-400 transition-colors">Total Growth</span>
                    <span className={cn("text-2xl md:text-3xl font-black", stats.growth > 0 ? "text-teal-400" : "text-rose-400")}>
                        {stats.growth > 0 ? "+" : ""}{stats.growth.toFixed(2)}%
                    </span>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg group hover:border-rose-500/20 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 blur-2xl rounded-full pointer-events-none"></div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-2 group-hover:text-rose-400 transition-colors">Max Drawdown</span>
                    <span className="text-2xl md:text-3xl font-black text-rose-400">
                        {stats.maxDrawdown.toFixed(2)}%
                    </span>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg group hover:border-green-500/20 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 blur-2xl rounded-full pointer-events-none"></div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-2 group-hover:text-green-400 transition-colors">Monthly Profit</span>
                    <span className={cn("text-2xl md:text-3xl font-black", stats.totalProfit > 0 ? "text-green-400" : "text-red-400")}>
                        {stats.totalProfit > 0 ? "+" : ""}{((stats.totalProfit / (balance || 1)) * 10).toFixed(2)}%
                    </span>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg group hover:border-purple-500/20 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 blur-2xl rounded-full pointer-events-none"></div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mb-2 group-hover:text-purple-400 transition-colors">Win Rate</span>
                    <span className="text-2xl md:text-3xl font-black text-purple-400">{stats.winRate.toFixed(1)}%</span>
                    <Progress value={stats.winRate} className="h-1 mt-3 w-2/3 bg-gray-800 [&>div]:bg-purple-500 shadow-[0_0_10px_#a855f7]" />
                </div>
            </div>

            {/* 2. DETAILED STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LEFT COL: Account Health */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-6 space-y-4">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="w-1 h-4 bg-gray-500 rounded-full"></span>
                            Account Health
                        </h3>

                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Balance</span>
                            <span className="text-sm font-bold text-white font-mono">{fmt(balance)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Equity</span>
                            <span className="text-sm font-bold text-white font-mono">{fmt(equity)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Total Deposits</span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">{fmt(stats.estDeposit)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Withdrawals</span>
                            <span className="text-sm font-bold text-gray-400 font-mono">{stats.estWithdrawal === 0 ? "-" : fmt(stats.estWithdrawal)}</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT COL: Trade Performance */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-6 space-y-4">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="w-1 h-4 bg-gray-500 rounded-full"></span>
                            Trade Performance
                        </h3>

                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Total Trades</span>
                            <span className="text-sm font-bold text-white font-mono">{stats.totalTrades}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Trades per Week</span>
                            <span className="text-sm font-bold text-white font-mono">{stats.tradesPerWeek.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Avg Holding Time</span>
                            <span className="text-sm font-bold text-white font-mono">{stats.avgDuration}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Last Trade</span>
                            <span className="text-sm font-bold text-white font-mono">{lastTradeAgo}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Best Trade</span>
                            <div className="text-right">
                                <p className="text-sm font-bold text-green-400 font-mono">{fmt(stats.bestTrade)}</p>
                                <p className="text-[10px] text-gray-500">{stats.bestTradeDate}</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 group hover:bg-white/2 px-2 rounded-lg transition-colors">
                            <span className="text-sm font-medium text-gray-400">Worst Trade</span>
                            <div className="text-right">
                                <p className="text-sm font-bold text-red-400 font-mono">{fmt(stats.worstTrade)}</p>
                                <p className="text-[10px] text-gray-500">{stats.worstTradeDate}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
}
