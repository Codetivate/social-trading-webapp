"use client";

import { useEffect, useState, useMemo } from "react";
import { getAnalytics, AnalyticStats, MonthlyResult, EquityPoint, SymbolDistribution } from "@/app/actions/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    BarChart, Bar, Cell, PieChart, Pie
} from "recharts";
import {
    ChartConfig, ChartContainer, ChartLegend, ChartLegendContent,
    ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { Activity, Info, Calendar as CalendarIcon, LayoutDashboard, LineChart as LineChartIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { format, subMonths } from "date-fns";
import { PnLCalendar } from "./PnLCalendar";
import { cn } from "@/lib/utils";
import { StrategyOverview } from "./StrategyOverview";

interface TraderAnalysisDashboardProps {
    masterId: string;
    isOwnProfile: boolean;
    initialAnalytics?: {
        stats: AnalyticStats;
        equityCurve: EquityPoint[];
        monthlyResults: MonthlyResult[];
        symbolDist: SymbolDistribution[];
        history: any[];
    } | null;
    onDataLoaded?: (data: {
        stats: AnalyticStats;
        monthlyResults: MonthlyResult[];
        equityCurve: EquityPoint[];
        symbolDist: SymbolDistribution[];
    }) => void;
}

// --- LEONARDO CHART CONFIGS ---

const equityConfig = {
    profit: { label: "Profit", color: "#2dd4bf" }, // Teal
} satisfies ChartConfig;

const monthlyConfig = {
    profit: { label: "Profit", color: "#2dd4bf" },
    loss: { label: "Loss", color: "#f43f5e" }, // Rose
} satisfies ChartConfig;

const symbolConfigBase: ChartConfig = {
    count: { label: "Trades" },
};

const barChartConfig = {
    value: { label: "Value", color: "#2dd4bf" }
} satisfies ChartConfig;

export default function TraderAnalysisDashboard({ masterId, initialAnalytics, onDataLoaded }: TraderAnalysisDashboardProps) {
    const [activeTab, setActiveTab] = useState<"OVERVIEW" | "ANALYSIS">("OVERVIEW");

    const [stats, setStats] = useState<AnalyticStats | null>(initialAnalytics?.stats || null);
    const [equityCurve, setEquityCurve] = useState<EquityPoint[]>(initialAnalytics?.equityCurve || []);
    const [monthly, setMonthly] = useState<MonthlyResult[]>(initialAnalytics?.monthlyResults || []);
    const [symbols, setSymbols] = useState<SymbolDistribution[]>(initialAnalytics?.symbolDist || []);
    const [history, setHistory] = useState<any[]>(initialAnalytics?.history || []); // Full trade history
    const [loading, setLoading] = useState(!initialAnalytics);

    // 🗓️ DATE FILTER STATE (Default: Last 3 Months)
    const [dateRange, setDateRange] = useState<{ from: Date | undefined, to: Date | undefined }>({
        from: subMonths(new Date(), 3),
        to: new Date()
    });
    // Temporary state for the popover (before applying)
    const [tempDateRange, setTempDateRange] = useState<{ from: Date | undefined, to: Date | undefined }>(dateRange);
    const [activeFilter, setActiveFilter] = useState<"3M" | "ALL" | "CUSTOM">("3M");
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [chartView, setChartView] = useState<"PROFIT" | "GROWTH" | "DRAWDOWN">("PROFIT");

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async (isSilent = false) => {
            if (!masterId) {
                if (isMounted) {
                    setStats(getEmptyStats());
                    setLoading(false);
                }
                return;
            }

            // Only show Loading Skeleton if we have NO data yet AND we are not silently updating
            if (!isSilent && !stats) setLoading(true);

            try {
                // Pass date range to backend
                const data = await getAnalytics(masterId, dateRange.from, dateRange.to);

                if (isMounted) {
                    if (data) {
                        setStats(data.stats);
                        setEquityCurve(data.equityCurve);
                        setMonthly(data.monthlyResults);
                        setSymbols(data.symbolDist);
                        setHistory(data.history || []);
                    } else {
                        setStats(getEmptyStats());
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.error("Analytics Poll Error", error);
                if (isMounted) setLoading(false);
            }
        };

        // 1. Initial Fetch
        // Skip if preloaded (initialAnalytics) AND this is the first run (e.g. dateRange matches default?)
        // Actually, initialAnalytics is usually "All Time" or "Default". props don't carry the date range context directly.
        // Assuming initial fetch corresponds to default date range or "All Time" depending on getAnalytics implementation.
        // If the user changes date range, we MUST fetch.
        // For simplicity: If initialAnalytics exists, we skip the FIRST fetch effect execution if deps haven't changed.
        // However, useEffect runs on mount.
        // We can use a ref to track if initial load happened.
        // Or simply: If loading is false (initially set via !initialAnalytics), skip the fetch?

        if (!initialAnalytics) fetchStats(false);
        else if (initialAnalytics) {
            // If we have initial data, we might want to respect the date filter embedded in it?
            // Usually getAnalytics defaults to "All Time" if no dates provided, or specific logic.
            // Our DateRange state defaults to 3M. 
            // If `getAnalytics` called server-side uses 3M default, we are good.
            // If we just want to suppress the FIRST fetch:
        }

        // 2. Real-Time Polling (Every 5s)
        const poller = setInterval(() => {
            fetchStats(true); // Silent update
        }, 5000);

        return () => {
            isMounted = false;
            clearInterval(poller);
        };
    }, [masterId, dateRange]); // Re-fetch (and reset poller) on date range change

    // 🚀 Notify Parent when data is ready
    useEffect(() => {
        if (stats && onDataLoaded) {
            onDataLoaded({
                stats,
                monthlyResults: monthly,
                equityCurve: equityCurve,
                symbolDist: symbols
            });
        }
    }, [stats, monthly, equityCurve, symbols, onDataLoaded]);

    // Helper for default/empty stats
    const getEmptyStats = (): AnalyticStats => ({
        totalTrades: 0, winRate: 0, profitFactor: 0, sharpe: 0, expectancy: 0,
        avgWin: 0, avgLoss: 0, maxDrawdown: 0, rrr: 0, totalProfit: 0,
        growth: 0,
        longPercent: 0, shortPercent: 0,
        bestTrade: 0, worstTrade: 0, bestTradeDate: "-", worstTradeDate: "-",
        lastTradeDate: "-", avgDuration: "0m", estDeposit: 0, estWithdrawal: 0,
        balance: 0, equity: 0, tradesPerWeek: 0
    });

    // Dynamic Pie Config
    const { pieData, pieConfig } = useMemo(() => {
        const colors = ["#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59"];
        const config = { ...symbolConfigBase };
        const data = symbols.map((s, i) => {
            const key = s.symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
            config[key] = { label: s.symbol, color: colors[i % colors.length] };
            return {
                symbol: key,
                count: s.count,
                fill: colors[i % colors.length],
                displaySymbol: s.symbol
            };
        });
        return { pieData: data, pieConfig: config };
    }, [symbols]);

    if (loading) return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <Card className="glass-panel border-none p-6">
                    <Skeleton className="h-[400px] w-full bg-white/5 rounded-xl" />
                </Card>
            </div>
        </div>
    );

    if (!stats) return null;

    return (
        <div className="space-y-6">
            {/* 1. TOP TAB NAVIGATION */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-4">
                <button
                    onClick={() => setActiveTab("OVERVIEW")}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all relative overflow-hidden group",
                        activeTab === "OVERVIEW"
                            ? "text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                            : "text-gray-400 hover:text-white"
                    )}
                >
                    <div className={cn("absolute inset-0 transition-opacity", activeTab === "OVERVIEW" ? "bg-white opacity-100" : "bg-white/5 opacity-0 group-hover:opacity-100")}></div>
                    <span className="relative z-10 flex items-center gap-2"><LayoutDashboard size={14} /> Overview</span>
                </button>
                <button
                    onClick={() => setActiveTab("ANALYSIS")}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all relative overflow-hidden group",
                        activeTab === "ANALYSIS"
                            ? "text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                            : "text-gray-400 hover:text-white"
                    )}
                >
                    <div className={cn("absolute inset-0 transition-opacity", activeTab === "ANALYSIS" ? "bg-white opacity-100" : "bg-white/5 opacity-0 group-hover:opacity-100")}></div>
                    <span className="relative z-10 flex items-center gap-2"><LineChartIcon size={14} /> Analysis & Charts</span>
                </button>
            </div>

            {/* 2. CONTENT */}
            {activeTab === "OVERVIEW" ? (
                <StrategyOverview
                    stats={stats}
                    balance={stats.balance}
                    equity={stats.equity}
                />
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    {/* EXISTING DASHBOARD CONTENT */}

                    {/* 1. HERO: DYNAMIC CHART */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-4 px-1">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest pl-1 flex items-center gap-2">
                                <span className="w-1 h-4 bg-teal-500 rounded-full shadow-[0_0_10px_#2dd4bf]"></span>
                                {chartView === "PROFIT" ? "Cumulative Profit" : chartView === "GROWTH" ? "Growth %" : "Drawdown %"}
                            </h3>

                            <div className="flex items-center gap-4">
                                {/* 📊 VIEW TOGGLER */}
                                <div className="flex items-center bg-[#0a0a0a] rounded-xl p-1 border border-white/5 shadow-inner">
                                    {(["PROFIT", "GROWTH", "DRAWDOWN"] as const).map((view) => (
                                        <button
                                            key={view}
                                            onClick={() => setChartView(view)}
                                            className={cn(
                                                "h-8 px-4 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center relative overflow-hidden",
                                                chartView === view
                                                    ? "text-black shadow-[0_0_15px_rgba(45,212,191,0.4)]"
                                                    : "text-gray-500 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            {chartView === view && <div className="absolute inset-0 bg-[#2dd4bf]"></div>}
                                            <span className="relative z-10">{view === "PROFIT" ? "Profit" : view === "GROWTH" ? "Growth %" : "Drawdown %"}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* 📅 DATE FILTER CONTROLS */}
                                <div className="flex items-center gap-2 bg-[#0a0a0a] p-1 rounded-xl border border-white/5 shadow-inner">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 text-[10px] font-bold rounded-lg transition-all border-none hover:bg-white/5",
                                            activeFilter === "3M" ? "bg-white/10 text-white shadow-sm" : "text-gray-500"
                                        )}
                                        onClick={() => {
                                            setDateRange({ from: subMonths(new Date(), 3), to: new Date() });
                                            setActiveFilter("3M");
                                        }}
                                    >
                                        3M
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 text-[10px] font-bold rounded-lg transition-all border-none hover:bg-white/5",
                                            activeFilter === "ALL" ? "bg-white/10 text-white shadow-sm" : "text-gray-500"
                                        )}
                                        onClick={() => {
                                            setDateRange({ from: undefined, to: undefined });
                                            setActiveFilter("ALL");
                                        }}
                                    >
                                        ALL
                                    </Button>

                                    <div className="w-px h-4 bg-white/10 mx-1"></div>

                                    <Popover open={isPopoverOpen} onOpenChange={(open) => {
                                        setIsPopoverOpen(open);
                                        if (open) {
                                            setTempDateRange(dateRange);
                                        }
                                    }}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    "h-8 text-[10px] justify-start text-left font-normal border-none hover:bg-white/5 transition-all min-w-[140px] rounded-lg",
                                                    !dateRange && "text-muted-foreground",
                                                    activeFilter === "CUSTOM" ? "bg-white/10 text-white font-bold" : "text-gray-500 font-bold"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-3 w-3" />
                                                {dateRange?.from ? (
                                                    dateRange.to ? (
                                                        <>
                                                            {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                                                        </>
                                                    ) : (
                                                        format(dateRange.from, "MMM d, yyyy")
                                                    )
                                                ) : (
                                                    <span>Pick a date</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 z-50 bg-[#0f0f0f] border-white/10 shadow-2xl" align="end">
                                            <div className="p-3">
                                                <Calendar
                                                    initialFocus
                                                    mode="range"
                                                    defaultMonth={tempDateRange?.from}
                                                    selected={tempDateRange as any}
                                                    onSelect={(range: any) => setTempDateRange(range)}
                                                    numberOfMonths={2}
                                                    className="bg-transparent text-white"
                                                    classNames={{
                                                        day_selected: "bg-[#2dd4bf] text-black hover:bg-[#2dd4bf] hover:text-black focus:bg-[#2dd4bf] focus:text-black",
                                                        day_today: "bg-white/10 text-white",
                                                        day_range_middle: "aria-selected:bg-[#2dd4bf]/20 aria-selected:text-white",
                                                    }}
                                                />
                                                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 text-xs text-gray-400 hover:text-white hover:bg-white/10"
                                                        onClick={() => setIsPopoverOpen(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 text-xs bg-[#2dd4bf] text-black hover:bg-[#2dd4bf]/90 font-bold shadow-[0_0_15px_rgba(45,212,191,0.3)]"
                                                        onClick={() => {
                                                            setDateRange(tempDateRange);
                                                            setActiveFilter("CUSTOM");
                                                            setIsPopoverOpen(false);
                                                        }}
                                                    >
                                                        Apply Range
                                                    </Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>

                        {/* CHART CARD */}
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                            {/* Gradient Glow */}
                            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-teal-500/5 blur-[120px] rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>

                            <div className="h-[400px] w-full relative z-10">
                                <ChartContainer config={equityConfig} className="h-full w-full">
                                    <AreaChart data={equityCurve} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="fillDrawdown" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={10}
                                            minTickGap={40}
                                            tickFormatter={(val) => new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            stroke="#666"
                                            fontSize={10}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            width={50}
                                            tickFormatter={(val) => chartView === "PROFIT" ? `$${val}` : `${val}%`}
                                            stroke="#666"
                                            fontSize={10}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent indicator="dot" className="bg-[#111] border-white/10 text-white shadow-xl" />} />
                                        <Area
                                            dataKey={chartView === "PROFIT" ? "profit" : chartView === "GROWTH" ? "growth" : "drawdown"}
                                            type="monotone"
                                            fill={chartView === "DRAWDOWN" ? "url(#fillDrawdown)" : "url(#fillProfit)"}
                                            fillOpacity={1}
                                            stroke={chartView === "DRAWDOWN" ? "#f43f5e" : "#2dd4bf"}
                                            strokeWidth={3}
                                            activeDot={{ r: 6, strokeWidth: 0, fill: "#fff" }}
                                        />
                                    </AreaChart>
                                </ChartContainer>
                            </div>
                        </div>
                    </div>

                    {/* 2. SPLIT: STATS & PIE */}
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">

                        {/* LEFT: GENERAL STATS (40%) */}
                        <div className="lg:col-span-4 space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest pl-1 flex items-center gap-2">
                                <span className="w-1 h-4 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></span>
                                General Statistics
                            </h3>
                            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                                <div className="divide-y divide-white/5">
                                    <StatRow label="Growth" value={`${stats.growth.toFixed(2)}%`} valueColor={stats.growth >= 0 ? "text-teal-400" : "text-rose-400"} description="Net Profit relative to Initial Balance." />
                                    <StatRow label="Max Drawdown" value={`${stats.maxDrawdown.toFixed(2)}%`} valueColor="text-rose-400" description="Maximum observed loss from a peak equity point." />
                                    <StatRow label="No. of Trades" value={stats.totalTrades} description="Total number of closed positions." />
                                    <StatRow label="Win Rate" value={`${stats.winRate.toFixed(2)}%`} valueColor="text-blue-400" description="Percentage of trades that ended in profit." />
                                    <StatRow label="Avg Profit" value={`$${stats.avgWin.toFixed(2)}`} valueColor="text-teal-400" description="Average profit of winning trades." />
                                    <StatRow label="Avg Loss" value={`$${stats.avgLoss.toFixed(2)}`} valueColor="text-rose-400" description="Average loss of losing trades." />
                                    <StatRow label="Profit Factor" value={stats.profitFactor.toFixed(2)} description="Gross Win / Gross Loss." />
                                    <StatRow label="Sharpe Ratio" value={stats.sharpe.toFixed(2)} description="Risk-adjusted return. Higher is better." />
                                    <StatRow label="Expectancy" value={`$${stats.expectancy.toFixed(2)}`} valueColor="text-teal-400" description="Average expected value per trade." />
                                    <StatRow label="Short / Long" value={`${stats.shortPercent.toFixed(0)}% / ${stats.longPercent.toFixed(0)}%`} description="Distribution of Sell (Short) vs Buy (Long) orders." />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: TRADES DISTRIBUTION (60%) */}
                        <div className="lg:col-span-6 space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest pl-1 flex items-center gap-2">
                                <span className="w-1 h-4 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
                                Trades Distribution
                            </h3>
                            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[100px] rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                                <div className="h-[300px] w-full relative z-10">
                                    <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[300px]">
                                        <PieChart>
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        hideLabel
                                                        className="bg-[#111] border-white/10 text-white shadow-xl"
                                                    />
                                                }
                                            />
                                            <Pie
                                                data={pieData}
                                                dataKey="count"
                                                nameKey="symbol"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                stroke="none"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="rgba(0,0,0,0)" />
                                                ))}
                                            </Pie>
                                            <ChartLegend
                                                content={<ChartLegendContent nameKey="symbol" />}
                                                className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
                                            />
                                        </PieChart>
                                    </ChartContainer>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. PNL CALENDAR */}
                    <div className="mt-6">
                        <PnLCalendar history={history} />
                    </div>

                    {/* 3. METRICS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* MONTHLY RESULTS */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest pl-1 flex items-center gap-2">
                                <span className="w-1 h-4 bg-teal-500 rounded-full shadow-[0_0_10px_#2dd4bf]"></span>
                                Result by Month
                            </h3>
                            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 h-[300px] shadow-lg">
                                <ChartContainer config={monthlyConfig} className="h-full w-full">
                                    <BarChart data={monthly}>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(val) => val.slice(5)} stroke="#666" fontSize={10} />
                                        <ChartTooltip
                                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                                            content={
                                                <ChartTooltipContent
                                                    className="bg-[#111] border-white/10 text-white shadow-xl"
                                                />
                                            }
                                        />
                                        <Bar dataKey="profit" radius={4}>
                                            {monthly.map((item, index) => (
                                                <Cell key={`cell-${index}`} fill={item.profit >= 0 ? "#2dd4bf" : "#f43f5e"} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            </div>
                        </div>

                        {/* WIN RATE BY MONTH (Mocked variation of monthly) */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest pl-1 flex items-center gap-2">
                                <span className="w-1 h-4 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
                                Win Rate by Month
                            </h3>
                            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 h-[300px] shadow-lg">
                                <ChartContainer config={barChartConfig} className="h-full w-full">
                                    <BarChart data={monthly}>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(val) => val.slice(5)} stroke="#666" fontSize={10} />
                                        <ChartTooltip
                                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                                            content={
                                                <ChartTooltipContent
                                                    className="bg-[#111] border-white/10 text-white shadow-xl"
                                                />
                                            }
                                        />
                                        <Bar dataKey="winRate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatRow({ label, value, valueColor = "text-white", description }: { label: string, value: string | number, valueColor?: string, description?: string }) {
    return (
        <div className="flex justify-between items-center px-6 py-3 hover:bg-white/5 transition-colors group first:rounded-t-xl last:rounded-b-xl relative">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
                {description && (
                    <div className="relative group/icon">
                        <div className="cursor-help p-1 -m-1 rounded-full hover:bg-white/10 transition-colors">
                            <Info size={10} className="text-gray-600 group-hover/icon:text-gray-300 transition-colors" />
                        </div>
                        {/* CSS Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2.5 bg-gray-950/95 backdrop-blur-sm border border-gray-800 rounded-lg shadow-xl text-[10px] text-gray-300 leading-relaxed z-100 hidden group-hover/icon:block pointer-events-none fade-in zoom-in duration-200">
                            {description}
                            {/* Arrow */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-950 border-r border-b border-gray-800 rotate-45 transform"></div>
                        </div>
                    </div>
                )}
            </div>
            <span className={`text-sm font-mono font-bold ${valueColor}`}>{value}</span>
        </div>
    );
}
