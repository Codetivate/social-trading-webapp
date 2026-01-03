"use client";

import { useEffect, useState } from "react";
import { getTradeHistory } from "@/app/actions/analytics";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp } from "lucide-react";

interface TradeHistoryTableProps {
    masterId: string;
}

export function TradeHistoryTable({ masterId }: TradeHistoryTableProps) {
    const [trades, setTrades] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            const data = await getTradeHistory(masterId, 100); // Limit 100
            setTrades(data);
            setLoading(false);
        };
        fetchHistory();
    }, [masterId]);

    if (loading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full bg-gray-800/50" />
                ))}
            </div>
        );
    }

    if (trades.length === 0) {
        return <p className="text-gray-500 text-sm text-center py-4">No trade history available.</p>;
    }

    return (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
            <Table>
                <TableHeader className="bg-gray-900/50">
                    <TableRow>
                        <TableHead className="text-xs font-bold text-gray-400">Time</TableHead>
                        <TableHead className="text-xs font-bold text-gray-400">Symbol</TableHead>
                        <TableHead className="text-xs font-bold text-gray-400">Type</TableHead>
                        <TableHead className="text-xs font-bold text-gray-400 text-right">Volume</TableHead>
                        <TableHead className="text-xs font-bold text-gray-400 text-right">Price</TableHead>
                        <TableHead className="text-xs font-bold text-gray-400 text-right">Profit</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {trades.map((trade) => (
                        <TableRow key={trade.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                            <TableCell className="text-xs text-gray-400 py-2">
                                {format(new Date(trade.closeTime), "dd MMM HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-white py-2">
                                {trade.symbol}
                            </TableCell>
                            <TableCell className="text-xs py-2">
                                <span className={`flex items-center gap-1 ${trade.type === "BUY" ? "text-green-400" : "text-red-400"}`}>
                                    {trade.type === "BUY" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                                    {trade.type}
                                </span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-300 text-right py-2">
                                {trade.volume}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500 text-right py-2">
                                <div className="flex flex-col">
                                    <span>{trade.closePrice}</span>
                                    <span className="text-[9px] line-through opacity-50">{trade.openPrice}</span>
                                </div>
                            </TableCell>
                            <TableCell className={`text-xs font-bold text-right py-2 ${trade.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {trade.netProfit > 0 ? "+" : ""}{trade.netProfit.toFixed(2)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
