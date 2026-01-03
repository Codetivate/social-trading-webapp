"use client";

import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// --- Types ---

type Signal = {
    ticket: string;
    symbol: string;
    action: "OPEN" | "CLOSE" | "MODIFY";
    type?: "BUY" | "SELL";
    price?: number;
    masterId: string;
    sl?: number;
    tp?: number;
};

type Execution = {
    type: "EXECUTION";
    followerId: string;
    masterTicket: string;
    followerTicket: string;
    symbol: string;
    action: string;
    status: "FILLED" | "FAILED";
    timestamp: number;
};

type MasterStats = {
    id: string;
    name: string; // Placeholder or fetched
    totalSignals: number;
    totalExecutions: number;
    lastActive: number;
    status: "ONLINE" | "IDLE" | "OFFLINE";
    lastSignal?: Signal;
};

const SOCKET_URL = "http://localhost:3001";

export default function CommandCenterPage() {
    const [isConnected, setIsConnected] = useState(false);

    // State
    const [masters, setMasters] = useState<Record<string, MasterStats>>({});
    const [feed, setFeed] = useState<(Signal | Execution)[]>([]);
    const [tps, setTps] = useState(0);
    const [sentiment, setSentiment] = useState({ bulls: 0, bears: 0, score: 50 });

    useEffect(() => {
        const socket = io(SOCKET_URL);

        socket.on("connect", () => {
            setIsConnected(true);
            console.log("Connected to Hydra Network");
        });

        socket.on("disconnect", () => {
            setIsConnected(false);
        });

        // 📡 Handle SIGNAL (Master -> Cloud)
        socket.on("signal", (payload: Signal) => {
            updateMasterStats(payload.masterId, "SIGNAL", payload);
            addToFeed(payload);
            updateSentiment(payload);
        });

        // ✅ Handle EXECUTION (Follower -> Cloud)
        socket.on("execution", (payload: Execution) => {
            addToFeed(payload);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // Helpers
    const updateSentiment = (signal: Signal) => {
        setSentiment(prev => {
            if (signal.action === "CLOSE") return prev; // Ignore closes for trend? Or maybe they mean reversal. Let's stick to OPEN/MODIFY volume.

            const isBuy = signal.type === "BUY";
            // Decay old sentiment slightly
            const newBulls = prev.bulls * 0.95 + (isBuy ? 1 : 0);
            const newBears = prev.bears * 0.95 + (isBuy ? 0 : 1);

            const total = newBulls + newBears;
            const score = total === 0 ? 50 : (newBulls / total) * 100;

            return { bulls: newBulls, bears: newBears, score };
        });
    };

    const updateMasterStats = (masterId: string, type: "SIGNAL", data: Signal) => {
        setMasters(prev => {
            const existing = prev[masterId] || {
                id: masterId,
                name: `Master ${masterId.slice(0, 4)}`,
                totalSignals: 0,
                totalExecutions: 0,
                lastActive: Date.now(),
                status: "ONLINE"
            };

            return {
                ...prev,
                [masterId]: {
                    ...existing,
                    totalSignals: existing.totalSignals + 1,
                    lastActive: Date.now(),
                    lastSignal: data
                }
            };
        });
    };

    const addToFeed = (item: Signal | Execution) => {
        setFeed(prev => [item, ...prev].slice(0, 100)); // Limit 100
    };

    // Render Helper for Sentiment
    const sentimentColor = sentiment.score > 60 ? "text-green-400" : (sentiment.score < 40 ? "text-red-400" : "text-gray-400");
    const sentimentLabel = sentiment.score > 60 ? "BULLISH" : (sentiment.score < 40 ? "BEARISH" : "NEUTRAL");

    // TPS Calculator
    useEffect(() => {
        const interval = setInterval(() => {
            setMasters(current => {
                const now = Date.now();
                const next = { ...current };
                let changed = false;
                Object.keys(next).forEach(key => {
                    if (now - next[key].lastActive > 5000 && next[key].status !== "IDLE") {
                        next[key].status = "IDLE";
                        changed = true;
                    }
                });
                return changed ? next : current;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);


    return (
        <div className="min-h-screen bg-[#050510] text-gray-100 font-sans selection:bg-cyan-500/30">

            {/* --- Header --- */}
            <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="h-3 w-3 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_#06b6d4]"></div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
                                HYDRA COMMAND CENTER
                            </h1>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
                                <span>AI SENTIMENT:</span>
                                <span className={`font-bold ${sentimentColor} transition-colors duration-500`}>
                                    {sentimentLabel} ({sentiment.score.toFixed(1)}%)
                                </span>
                                {/* Mini Bar */}
                                <div className="h-1.5 w-16 bg-gray-800 rounded-full overflow-hidden ml-1">
                                    <div
                                        className={`h-full transition-all duration-500 ${sentiment.score > 50 ? 'bg-green-500' : 'bg-red-500'}`}
                                        style={{ width: `${sentiment.score}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm font-mono">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500">NETWORK STATUS:</span>
                            <Badge variant="outline" className={isConnected ? "border-green-500 text-green-400 bg-green-500/10" : "border-red-500 text-red-500"}>
                                {isConnected ? "CONNECTED" : "OFFLINE"}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500">LATENCY:</span>
                            <span className="text-cyan-400">~12ms</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* --- LEFT: Master Grid --- */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-lg font-semibold text-gray-400 flex items-center gap-2">
                        <span className="text-purple-500">■</span> ACTIVE MASTERS ({Object.keys(masters).length})
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.values(masters).map(master => {
                            const isFlash = Date.now() - master.lastActive < 600;
                            const isSell = master.lastSignal?.type === "SELL";
                            const flashClass = isFlash
                                ? (isSell ? "border-red-500 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.4)]" : "border-green-500 bg-green-500/5 shadow-[0_0_30px_rgba(34,197,94,0.4)]")
                                : "border-gray-800 bg-gray-900/40 hover:border-gray-700";

                            return (
                                <Card key={master.id} className={`border p-6 transition-all duration-300 relative overflow-hidden ${flashClass}`}>
                                    {/* Background Pulse */}
                                    {isFlash && <div className="absolute inset-0 bg-white/5 animate-ping opacity-10" />}

                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-gray-200">{master.name}</h3>
                                            <p className="text-xs text-gray-500 font-mono mt-1">{master.id}</p>
                                        </div>
                                        <Badge className="bg-gray-800 text-gray-400 border-none">{master.status}</Badge>
                                    </div>

                                    <div className="flex items-end justify-between font-mono">
                                        <div>
                                            <div className="text-xs text-gray-500">LAST SIGNAL</div>
                                            <div className="text-2xl font-bold flex items-center gap-2">
                                                {master.lastSignal?.symbol || "--"}
                                                <span className={`text-sm ${master.lastSignal?.type === "SELL" ? "text-red-400" : "text-green-400"}`}>
                                                    {master.lastSignal?.action}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500">TICKET</div>
                                            <div className="text-sm text-cyan-400">{master.lastSignal?.ticket || "--"}</div>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}

                        {Object.keys(masters).length === 0 && (
                            <div className="col-span-2 border border-dashed border-gray-800 rounded-lg p-12 text-center text-gray-600">
                                Waiting for Master Signals...
                            </div>
                        )}
                    </div>
                </div>

                {/* --- RIGHT: Live Execution Feed --- */}
                <div className="bg-gray-900/80 border border-gray-800 rounded-xl flex flex-col h-[600px] shadow-2xl overflow-hidden">
                    <div className="p-4 border-b border-gray-800 bg-black/20 flex justify-between items-center">
                        <h2 className="font-mono text-sm font-bold text-gray-400">LIVE FEED</h2>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            <span className="text-gray-500">REALTIME</span>
                        </div>
                    </div>

                    <ScrollArea className="flex-1 p-4 font-mono text-xs">
                        {feed.map((item, i) => {
                            const isExec = "status" in item;
                            if (isExec) {
                                const exec = item as Execution;
                                return (
                                    <div key={i} className="mb-3 pl-3 border-l-2 border-purple-500 animate-in slide-in-from-right-2 fade-in duration-300">
                                        <div className="flex justify-between text-gray-500 mb-1">
                                            <span>FOLLOWER EXECUTION ({(Date.now() - exec.timestamp * 1000).toFixed(0)}ms ago)</span>
                                            <span className="text-purple-400">FILLED</span>
                                        </div>
                                        <div className="text-gray-300">
                                            <span className="text-white font-bold">{exec.symbol}</span> {exec.action}
                                            <span className="text-gray-600 mx-2">&rarr;</span>
                                            Ticket: {exec.followerTicket}
                                        </div>
                                    </div>
                                )
                            } else {
                                const sig = item as Signal;
                                return (
                                    <div key={i} className="mb-3 pl-3 border-l-2 border-cyan-500 animate-in slide-in-from-left-2 fade-in duration-300 bg-cyan-900/5 py-1">
                                        <div className="flex justify-between text-gray-500 mb-1">
                                            <span>MASTER SIGNAL</span>
                                            <span className="text-cyan-400">SENT</span>
                                        </div>
                                        <div className="text-gray-300">
                                            {sig.action} <span className={sig.type === "SELL" ? "text-red-400" : "text-green-400"}>{sig.symbol}</span>
                                            <span className="text-gray-600 mx-2">ID:</span> {sig.ticket}
                                        </div>
                                    </div>
                                )
                            }
                        })}
                    </ScrollArea>
                </div>

            </main>
        </div>
    );
}
