"use client";

import { useEffect, useState } from "react";
import { getOpenPositions } from "@/app/actions/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Position = {
    ticket: string;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    sl: number | null;
    tp: number | null;
    openTime: Date;
};

export function OpenPositionsTable({ userId, minimal = false }: { userId: string, minimal?: boolean }) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);

    // 🔄 Poll every 3 seconds
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            const data = await getOpenPositions(userId);
            if (isMounted) {
                setPositions(data);
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [userId]);

    // Calculate Total PnL
    const totalPnL = positions.reduce((sum, p) => sum + p.profit, 0);

    const content = (
        <>
            {loading ? (
                <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            ) : positions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                    No active positions
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-muted-foreground border-b text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 pl-1">Ticket</th>
                                <th className="py-2">Time</th>
                                <th className="py-2">Sym</th>
                                <th className="py-2">Type</th>
                                <th className="py-2 text-right">Vol</th>
                                <th className="py-2 text-right">Price</th>
                                <th className="py-2 text-right">TP / SL</th>
                                <th className="py-2 text-right pr-1">PnL</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {positions.map((pos) => (
                                <tr key={pos.ticket} className="hover:bg-muted/30 transition-colors">
                                    <td className="py-3 pl-1 font-mono text-xs opacity-70">#{pos.ticket}</td>
                                    <td className="py-3 text-xs opacity-75">
                                        {new Date(pos.openTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="py-3 font-semibold">{pos.symbol}</td>
                                    <td className="py-3">
                                        <Badge variant={pos.type === "BUY" ? "default" : "destructive"} className="text-[10px] h-5 px-1.5 uppercase">
                                            {pos.type}
                                        </Badge>
                                    </td>
                                    <td className="py-3 text-right font-mono">{pos.volume.toFixed(2)}</td>
                                    <td className="py-3 text-right">
                                        <div className="flex flex-col items-end leading-tight">
                                            <span className="text-xs opacity-70">{pos.openPrice}</span>
                                            <span className="font-mono">{pos.currentPrice}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 text-right text-xs opacity-70 font-mono">
                                        <div className="text-green-500/80">{pos.tp || '-'}</div>
                                        <div className="text-red-500/80">{pos.sl || '-'}</div>
                                    </td>
                                    <td className={`py-3 text-right font-bold pr-1 ${pos.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                                        {pos.profit.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );

    if (minimal) {
        return <div className="border border-gray-800 rounded-lg bg-black/20 p-4">{content}</div>;
    }

    return (
        <Card className="border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">
                    Open Positions <Badge variant="secondary" className="ml-2">{positions.length}</Badge>
                </CardTitle>
                <div className={`text-lg font-bold ${totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {totalPnL >= 0 ? "+" : ""}{totalPnL.toFixed(2)} USD
                </div>
            </CardHeader>
            <CardContent>
                {content}
            </CardContent>
        </Card>
    );
}
