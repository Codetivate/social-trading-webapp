"use client";

import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, getDay, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown } from "lucide-react";
import { cn, getGMTOffset } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface Trade {
    id: string; // Unique ID from DB
    ticket: string;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    closePrice: number;
    openTime: Date | string;
    closeTime: Date | string;
    netProfit: number;
}

interface PnLCalendarProps {
    history: Trade[];
}

export function PnLCalendar({ history }: PnLCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    // 1. Group Trades by Date
    const dailyStats = useMemo(() => {
        const stats = new Map<string, { profit: number; trades: number; wins: number; items: Trade[] }>();

        history.forEach(trade => {
            if (!trade.closeTime) return;
            const dateStr = new Date(trade.closeTime).toISOString().split('T')[0]; // YYYY-MM-DD

            if (!stats.has(dateStr)) {
                stats.set(dateStr, { profit: 0, trades: 0, wins: 0, items: [] });
            }
            const day = stats.get(dateStr)!;
            day.profit += trade.netProfit;
            day.trades += 1;
            if (trade.netProfit > 0) day.wins += 1;
            day.items.push(trade);
        });

        return stats;
    }, [history]);

    // 2. Calendar Grid Logic
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // 3. Navigation
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-premium uppercase tracking-wider pl-1">
                    PnL Calendar <span className="text-gray-500 ml-2">{format(currentDate, "MMM yyyy")}</span>
                </h3>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 hover:bg-white/10 text-gray-400 hover:text-white">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 hover:bg-white/10 text-gray-400 hover:text-white">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Card className="glass-panel border-none p-4">
                {/* Weekday Header */}
                <div className="grid grid-cols-7 mb-2 text-center">
                    {weekDays.map(day => (
                        <div key={day} className="text-[10px] font-bold text-gray-500 uppercase py-2">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day, idx) => {
                        const dateKey = format(day, "yyyy-MM-dd");
                        const dayData = dailyStats.get(dateKey);
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());

                        // Styling Logic
                        // If no trades: faint opacity or separate style
                        // If profit > 0: Neon Green/Teal
                        // If profit < 0: Neon Red/Rose

                        let bgClass = "bg-white/5 border-white/5 hover:bg-white/10";
                        let textClass = "text-gray-400";
                        if (dayData) {
                            if (dayData.profit >= 0) {
                                bgClass = "bg-[#2dd4bf]/20 border-[#2dd4bf]/30 hover:bg-[#2dd4bf]/30 shadow-[0_0_10px_rgba(45,212,191,0.1)]";
                                textClass = "text-[#2dd4bf]";
                            } else {
                                bgClass = "bg-[#f43f5e]/20 border-[#f43f5e]/30 hover:bg-[#f43f5e]/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]";
                                textClass = "text-[#f43f5e]";
                            }
                        }

                        if (!isCurrentMonth) {
                            bgClass = "bg-transparent border-transparent opacity-30"; // Dim non-month days
                        }

                        return (
                            <div
                                key={dateKey}
                                onClick={() => dayData && setSelectedDate(day)}
                                className={cn(
                                    "relative h-20 rounded-lg border p-2 flex flex-col justify-between transition-all cursor-pointer group",
                                    bgClass,
                                    !dayData && isCurrentMonth && "hover:border-white/20"
                                )}
                            >
                                <span className={cn("text-[10px] font-bold absolute top-2 left-2", !isCurrentMonth && "text-gray-700")}>
                                    {format(day, "d")}
                                </span>

                                {dayData ? (
                                    <div className="flex flex-col items-center justify-center h-full mt-2">
                                        <span className={cn("text-[10px] sm:text-xs font-bold px-0.5 break-all leading-tight", textClass)}>
                                            {dayData.profit >= 0 ? "+" : "-"}
                                            {Math.abs(dayData.profit) >= 1000
                                                ? `$${(Math.abs(dayData.profit) / 1000).toFixed(1)}k`
                                                : `$${Math.abs(dayData.profit).toFixed(0)}`}
                                        </span>
                                        <span className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5">
                                            {dayData.trades} Trades
                                        </span>
                                    </div>
                                ) : (
                                    isCurrentMonth && <div className="flex items-center justify-center h-full text-[9px] text-gray-600">No Trades</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* DETAIL MODAL */}
            {selectedDate && dailyStats.get(format(selectedDate, "yyyy-MM-dd")) && (
                <DayDetailModal
                    date={selectedDate}
                    data={dailyStats.get(format(selectedDate, "yyyy-MM-dd"))!}
                    onClose={() => setSelectedDate(null)}
                />
            )}
        </div>
    );
}

function DayDetailModal({ date, data, onClose }: { date: Date, data: { profit: number, trades: number, wins: number, items: Trade[] }, onClose: () => void }) {
    const winRate = (data.wins / data.trades) * 100;
    const grossPnL = data.profit; // Simplified for display, real calc needs gross
    // Sort items by time desc
    const sortedTrades = [...data.items].sort((a, b) => new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime());
    const [visibleCount, setVisibleCount] = useState(20);
    const displayedTrades = sortedTrades.slice(0, visibleCount);

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-4xl max-h-[90vh] glass-panel border border-white/10 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
                <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-white/5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                        <CardTitle className="text-sm sm:text-lg text-white">
                            {format(date, "do MMMM, yyyy")}
                        </CardTitle>
                        <span className={cn("text-sm sm:text-lg font-mono font-bold", data.profit >= 0 ? "text-teal-400" : "text-rose-400")}>
                            Net PnL: ${data.profit.toFixed(2)}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10 rounded-full">
                        <X className="h-5 w-5 text-gray-400 hover:text-white" />
                    </Button>
                </CardHeader>

                <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
                    {/* STATS HEADER */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 p-4 sm:p-6 bg-white/5 shrink-0">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-bold">Total Trades</span>
                            <span className="text-lg sm:text-2xl font-bold text-white">{data.trades}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-bold">Win Rate</span>
                            <span className="text-lg sm:text-2xl font-bold text-blue-400">{winRate.toFixed(2)}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-bold">Profit</span>
                            <span className="text-lg sm:text-2xl font-bold text-teal-400">${data.profit.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-bold">Lot Volume</span>
                            <span className="text-lg sm:text-2xl font-bold text-yellow-400">
                                {data.items.reduce((acc, t) => acc + t.volume, 0).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* TRADES TABLE */}
                    <div className="flex-1 overflow-auto p-0">
                        <Table>
                            <TableHeader className="bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">Symbol</TableHead>
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">Type</TableHead>
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">Volume</TableHead>
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">Open Price</TableHead>
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">Close Price</TableHead>
                                    <TableHead className="text-gray-400 font-bold text-xs h-10">
                                        Time (Open / Close) <span className="text-[10px] font-normal text-gray-500 ml-1">{getGMTOffset()}</span>
                                    </TableHead>
                                    <TableHead className="text-right text-gray-400 font-bold text-xs h-10">PnL</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayedTrades.map(trade => (
                                    <TableRow key={trade.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                        <TableCell className="font-bold text-white text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded bg-[#F7A600] flex items-center justify-center text-black text-[9px] font-bold shadow-sm">
                                                    {trade.symbol[0]}
                                                </div>
                                                {trade.symbol}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <Badge variant="outline" className={cn(
                                                "border-none font-bold px-1.5 py-0.5 text-[10px]",
                                                trade.type.toUpperCase().includes("BUY")
                                                    ? "bg-teal-500/20 text-teal-400"
                                                    : "bg-rose-500/20 text-rose-400"
                                            )}>
                                                {trade.type.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-gray-300 font-mono">{trade.volume}</TableCell>
                                        <TableCell className="text-xs text-gray-400 font-mono">{trade.openPrice}</TableCell>
                                        <TableCell className="text-xs text-gray-400 font-mono">{trade.closePrice}</TableCell>
                                        <TableCell className="text-xs text-gray-500">
                                            <div className="flex flex-col gap-0.5 text-[10px]">
                                                <span>{format(new Date(trade.openTime), "HH:mm:ss")}</span>
                                                <span className="opacity-70">{format(new Date(trade.closeTime), "HH:mm:ss")}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className={cn("text-right font-mono font-bold text-xs", trade.netProfit >= 0 ? "text-teal-400" : "text-rose-400")}>
                                            ${trade.netProfit.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {visibleCount < sortedTrades.length && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-4">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-white/10 hover:bg-white/5 text-gray-400 hover:text-white text-xs"
                                                onClick={() => setVisibleCount(prev => prev + 20)}
                                            >
                                                Show More ({sortedTrades.length - visibleCount} remaining)
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
