"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis, ResponsiveContainer } from "recharts"

import {
    Card,
    CardContent,
} from "@/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"

export const description = "A linear line chart"

const chartConfig = {
    equity: {
        label: "Equity",
        color: "#10B981", // ✅ Green for Growth
    },
} satisfies ChartConfig

interface MasterEquityChartProps {
    data: { date: string; value: number }[];
    height?: number;
    showAxes?: boolean;
    color?: string; // Hex or tailwind class
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        // Format Date: "03 Mar 2025"
        const dateObj = new Date(label || "");

        // 🛡️ Frontend Logic: If Era 0 (1970) or invalid, show "-"
        const dateStr = (isNaN(dateObj.getTime()) || dateObj.getFullYear() === 1970)
            ? "-"
            : dateObj.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

        const value = Number(payload[0].value).toFixed(2);
        const isPositive = Number(value) >= 0;

        return (
            <div className="bg-[#0F1115]/90 backdrop-blur-xl supports-backdrop-filter:bg-[#0F1115]/80 text-white p-3 rounded-xl shadow-2xl border border-white/10 shadow-black/50 min-w-[150px] w-max animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/5">
                <div className="mb-2 text-gray-400 text-[10px] font-bold uppercase tracking-wider border-b border-white/5 pb-2 flex justify-between items-center gap-4">
                    <span>Date</span>
                    <span className="text-gray-200">{dateStr}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-gray-300">Growth</span>
                    <span className={`text-base font-black tracking-tight whitespace-nowrap ${isPositive ? "text-[#10B981] drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]"}`}>
                        {value}%
                    </span>
                </div>
            </div>
        )
    }
    return null
}

export function MasterEquityChart({ data, height = 60, showAxes = false, color = "#10B981" }: MasterEquityChartProps) {
    // If no data, return empty or skeleton
    if (!data || data.length === 0) return <div className="h-full w-full bg-white/5 animate-pulse rounded-lg" />;

    return (
        <div style={{ height: height, width: "100%" }}>
            <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart
                    accessibilityLayer
                    data={data}
                    margin={{
                        left: 0,
                        right: 0,
                        top: 5,
                        bottom: 5,
                    }}
                >
                    {/* <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" /> */}
                    <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => value.slice(0, 3)}
                        hide={!showAxes}
                    />
                    <ChartTooltip
                        cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '3 3' }}
                        content={<CustomTooltip />}
                    />
                    <Line
                        dataKey="value"
                        type="linear" // ✅ Explicit Linear for "Slope Swing"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false} // ⚡ Performance: Disable animation on re-renders
                    />
                </LineChart>
            </ChartContainer>
        </div>
    )
}
