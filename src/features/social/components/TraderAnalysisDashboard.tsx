"use client";

import { useEffect, useState, useMemo } from "react";
import { getAnalytics, AnalyticStats, MonthlyResult, EquityPoint, SymbolDistribution } from "@/app/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    BarChart, Bar, Cell, PieChart, Pie, Label
} from "recharts";
import {
    ChartConfig, ChartContainer, ChartLegend, ChartLegendContent,
    ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { Activity, Info, Calendar as CalendarIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";

interface TraderAnalysisDashboardProps {
    masterId: string;
    isOwnProfile: boolean;
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

export default function TraderAnalysisDashboard({ masterId }: TraderAnalysisDashboardProps) {
    const [stats, setStats] = useState<AnalyticStats | null>(null);
    const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
    const [monthly, setMonthly] = useState<MonthlyResult[]>([]);
    const [symbols, setSymbols] = useState<SymbolDistribution[]>([]);
    const [loading, setLoading] = useState(true);

    // 🗓️ DATE FILTER STATE (Default: Last 3 Months)
    const [dateRange, setDateRange] = useState<{ from: Date | undefined, to: Date | undefined }>({
        from: subMonths(new Date(), 3),
        to: new Date()
    });
    // Temporary state for the popover (before applying)
    const [tempDateRange, setTempDateRange] = useState<{ from: Date | undefined, to: Date | undefined }>(dateRange);
    const [activeFilter, setActiveFilter] = useState<"3M" | "ALL" | "CUSTOM">("3M");
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

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

            // Only show Loading Skeleton if we have NO data yet
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
        fetchStats(false);

        // 2. Real-Time Polling (Every 5s)
        const poller = setInterval(() => {
            fetchStats(true); // Silent update
        }, 5000);

        return () => {
            isMounted = false;
            clearInterval(poller);
        };
    }, [masterId, dateRange]); // Re-fetch (and reset poller) on date range change

    // Helper for default/empty stats
    const getEmptyStats = (): AnalyticStats => ({
        totalTrades: 0, winRate: 0, profitFactor: 0, sharpe: 0, expectancy: 0,
        avgWin: 0, avgLoss: 0, maxDrawdown: 0, rrr: 0, totalProfit: 0,
        longPercent: 0, shortPercent: 0,
    });



    // Dynamic Pie Config
    const { pieData, pieConfig } = useMemo(() => {
        // Use a single Teal color for all segments to match the monochromatic "Donut" look if intended, 
        // OR keep colorful. The image shows ONE color. I will use a Teal palette.
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
            {/* Skeleton: Cumulative Profit */}
            <div className="space-y-4">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <Card className="glass-panel border-none p-6">
                    <Skeleton className="h-[400px] w-full bg-white/5 rounded-xl" />
                </Card>
            </div>

            {/* Skeleton: Split Stats & Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                <div className="lg:col-span-4 space-y-4">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Card className="glass-panel border-none overflow-hidden p-0">
                        <div className="divide-y divide-white/5">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="flex justify-between items-center px-6 py-3">
                                    <Skeleton className="h-3 w-24 bg-white/10" />
                                    <Skeleton className="h-4 w-16 bg-white/10" />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-6 space-y-4">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Card className="glass-panel border-none p-6 flex flex-col items-center justify-center">
                        <Skeleton className="h-[300px] w-[300px] rounded-full bg-white/5" />
                    </Card>
                </div>
            </div>

            {/* Skeleton: Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Card className="glass-panel border-none p-6 h-[300px]">
                        <Skeleton className="h-full w-full bg-white/5 rounded-xl" />
                    </Card>
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Card className="glass-panel border-none p-6 h-[300px]">
                        <Skeleton className="h-full w-full bg-white/5 rounded-xl" />
                    </Card>
                </div>
            </div>
        </div>
    );

    // If stats is still null (shouldn't happen with defaults), render nothing or fallback
    if (!stats) return null;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* 1. HERO: CUMULATIVE PROFIT */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Cumulative Profit</h3>

                    {/* 📅 DATE FILTER CONTROLS */}
                    {/* 📅 DATE FILTER CONTROLS */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-7 text-[10px] font-bold border-white/10 hover:bg-white/5 transition-all",
                                activeFilter === "3M" && "bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]/50 hover:bg-[#2dd4bf]/20 shadow-[0_0_10px_-5px_#2dd4bf]"
                            )}
                            onClick={() => {
                                setDateRange({ from: subMonths(new Date(), 3), to: new Date() });
                                setActiveFilter("3M");
                            }}
                        >
                            3M
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-7 text-[10px] font-bold border-white/10 hover:bg-white/5 transition-all",
                                activeFilter === "ALL" && "bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]/50 hover:bg-[#2dd4bf]/20 shadow-[0_0_10px_-5px_#2dd4bf]"
                            )}
                            onClick={() => {
                                setDateRange({ from: undefined, to: undefined });
                                setActiveFilter("ALL");
                            }}
                        >
                            ALL
                        </Button>

                        <Popover open={isPopoverOpen} onOpenChange={(open) => {
                            setIsPopoverOpen(open);
                            if (open) {
                                // Reset temp state to current actual state when opening
                                setTempDateRange(dateRange);
                            }
                        }}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "h-7 text-[10px] font-bold justify-start text-left font-normal border-white/10 hover:bg-white/5 transition-all min-w-[140px]",
                                        !dateRange && "text-muted-foreground",
                                        activeFilter === "CUSTOM" && "bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]/50 hover:bg-[#2dd4bf]/20 shadow-[0_0_10px_-5px_#2dd4bf]"
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
                            <PopoverContent className="w-auto p-0 z-50 bg-gray-950 border-gray-800" align="end">
                                <div className="p-3">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={tempDateRange?.from}
                                        selected={tempDateRange as any}
                                        onSelect={(range: any) => setTempDateRange(range)}
                                        numberOfMonths={2}
                                        className="bg-gray-950 text-white rounded-md border border-gray-800"
                                        classNames={{
                                            selected: "!bg-[#2dd4bf] !text-black hover:!bg-[#2dd4bf] hover:!text-black focus:!bg-[#2dd4bf] focus:!text-black",
                                            day_today: "bg-white/10 text-white",
                                            range_middle: "aria-selected:!bg-[#2dd4bf]/20 aria-selected:!text-white",
                                            range_start: "!bg-[#2dd4bf] !text-black hover:!bg-[#2dd4bf] hover:!text-black rounded-l-md",
                                            range_end: "!bg-[#2dd4bf] !text-black hover:!bg-[#2dd4bf] hover:!text-black rounded-r-md"
                                        }}
                                    />
                                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-800">
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
                                            className="h-8 text-xs bg-[#2dd4bf] text-black hover:bg-[#2dd4bf]/90 font-bold"
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
                <Card className="glass-panel border-none p-6">
                    <div className="h-[400px] w-full">
                        <ChartContainer config={equityConfig} className="h-full w-full">
                            <AreaChart data={equityCurve} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
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
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    width={50}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <ChartTooltip content={<ChartTooltipContent indicator="dot" className="bg-black/90 border-white/10" />} />
                                <Area
                                    dataKey="profit"
                                    type="monotone"
                                    fill="url(#fillProfit)"
                                    fillOpacity={1}
                                    stroke="#2dd4bf"
                                    strokeWidth={3}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </div>
                </Card>
            </div>

            {/* 2. SPLIT: STATS & PIE */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">

                {/* LEFT: GENERAL STATS (40%) */}
                <div className="lg:col-span-4 space-y-4">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">General Statistics</h3>
                    <Card className="glass-panel border-none overflow-hidden">
                        <div className="divide-y divide-white/5">
                            <StatRow label="No. of Trades" value={stats.totalTrades} />
                            <StatRow label="Win Rate" value={`${stats.winRate.toFixed(2)}%`} valueColor="text-blue-400" />
                            <StatRow label="Avg Profit" value={`$${stats.avgWin.toFixed(2)}`} valueColor="text-teal-400" />
                            <StatRow label="Avg Loss" value={`$${stats.avgLoss.toFixed(2)}`} valueColor="text-rose-400" />
                            <StatRow label="Profit Factor" value={stats.profitFactor.toFixed(2)} />
                            <StatRow label="Sharpe Ratio" value={stats.sharpe.toFixed(2)} />
                            <StatRow label="Expectancy" value={`$${stats.expectancy.toFixed(2)}`} valueColor="text-teal-400" />
                            <StatRow label="Short / Long" value={`${stats.shortPercent.toFixed(0)}% / ${stats.longPercent.toFixed(0)}%`} />
                        </div>
                    </Card>
                </div>

                {/* RIGHT: DISTRIBUTION (60%) */}
                <div className="lg:col-span-6 space-y-4">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Trades Distribution</h3>
                    <Card className="glass-panel border-none p-6 flex flex-col items-center justify-center">
                        <div className="h-[300px] w-full">
                            <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[250px] pb-0 [&_.recharts-pie-label-text]:fill-foreground">
                                <PieChart>
                                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                                    <Pie
                                        data={pieData}
                                        dataKey="count"
                                        nameKey="symbol"
                                        innerRadius={60}
                                        strokeWidth={5}
                                    >
                                        <Label
                                            content={({ viewBox }) => {
                                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                                    return (
                                                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-white text-3xl font-bold">
                                                                {stats.totalTrades.toLocaleString()}
                                                            </tspan>
                                                            <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-gray-400 text-xs">
                                                                Trades
                                                            </tspan>
                                                        </text>
                                                    )
                                                }
                                            }}
                                        />
                                    </Pie>
                                </PieChart>
                            </ChartContainer>
                        </div>
                    </Card>
                </div>
            </div>

            {/* 3. METRICS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* MONTHLY RESULTS */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Result by Month</h3>
                    <Card className="glass-panel border-none p-6 h-[300px]">
                        <ChartContainer config={monthlyConfig} className="h-full w-full">
                            <BarChart data={monthly}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(val) => val.slice(5)} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="profit" radius={4}>
                                    {monthly.map((item, index) => (
                                        <Cell key={`cell-${index}`} fill={item.profit >= 0 ? "#2dd4bf" : "#f43f5e"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </Card>
                </div>

                {/* WIN RATE BY MONTH (Mocked variation of monthly) */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Win Rate by Month</h3>
                    <Card className="glass-panel border-none p-6 h-[300px]">
                        <ChartContainer config={barChartConfig} className="h-full w-full">
                            <BarChart data={monthly}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(val) => val.slice(5)} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="winRate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </Card>
                </div>
            </div>

        </div>
    );
}

function StatRow({ label, value, valueColor = "text-white" }: { label: string, value: string | number, valueColor?: string }) {
    return (
        <div className="flex justify-between items-center px-6 py-3 hover:bg-white/5 transition-colors">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                {label} <Info size={10} className="text-gray-700" />
            </span>
            <span className={`text-sm font-mono font-bold ${valueColor}`}>{value}</span>
        </div>
    );
}
