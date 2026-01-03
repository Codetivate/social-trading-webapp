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
import { Activity, Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            const data = await getAnalytics(masterId);
            if (data) {
                setStats(data.stats);
                setEquityCurve(data.equityCurve);
                setMonthly(data.monthlyResults);
                setSymbols(data.symbolDist);
            }
            setLoading(false);
        };
        fetchStats();
    }, [masterId]);

    // Dynamic Pie Config
    const { pieData, pieConfig } = useMemo(() => {
        const colors = ["#2dd4bf", "#3b82f6", "#a855f7", "#f43f5e", "#eab308"];
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

    if (loading) return <Skeleton className="w-full h-[600px] rounded-xl bg-white/5" />;

    if (!stats) return (
        <div className="p-12 text-center bg-white/5 rounded-xl border border-white/10 border-dashed">
            <p className="text-gray-400">No trading data available.</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* 1. HERO: CUMULATIVE PROFIT */}
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Cumulative Profit</h3>
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
                            <StatRow label="Short / Long" value="45% / 55%" /> {/* Mock */}
                        </div>
                    </Card>
                </div>

                {/* RIGHT: DISTRIBUTION (60%) */}
                <div className="lg:col-span-6 space-y-4">
                    <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">Trades Distribution</h3>
                    <Card className="glass-panel border-none p-6 flex flex-col items-center justify-center">
                        <div className="h-[300px] w-full">
                            <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[300px]">
                                <PieChart>
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                                    <Pie
                                        data={pieData}
                                        dataKey="count"
                                        nameKey="symbol"
                                        innerRadius={60}
                                        outerRadius={100}
                                        strokeWidth={2}
                                        stroke="rgba(0,0,0,0.5)"
                                    >
                                        <Label
                                            content={({ viewBox }) => {
                                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                                    return (
                                                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-white text-3xl font-bold">
                                                                {pieData.reduce((acc, curr) => acc + curr.count, 0)}
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
                                    <ChartLegend content={<ChartLegendContent nameKey="displaySymbol" />} className="flex-wrap gap-2 mt-4" />
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
                            <BarChart data={monthly.map(m => ({ ...m, winRate: Math.random() * 40 + 40 }))}>
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
