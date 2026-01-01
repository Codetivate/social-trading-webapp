"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Search, Activity, ShieldCheck, AlertOctagon, RefreshCcw, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, Globe, Hash } from "lucide-react";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

// Banking Grade Withdrawal Interface
interface WithdrawalRequest {
    id: string;
    transactionRef: string;
    user: string;
    legalName: string;
    amount: number;
    bank: string;
    account: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
    riskScore: number;
    flags: string[];
    requestedAt: string;
    processedAt?: string;
    ipAddress: string;
}

// Mock Withdrawal Queue
const MOCK_WITHDRAWALS: WithdrawalRequest[] = [
    {
        id: "W-1001",
        transactionRef: "TXN-8842-1192",
        user: "MasterJohn",
        legalName: "John Doe",
        amount: 500,
        bank: "KBank",
        account: "123-***-789",
        status: "PENDING",
        riskScore: 12,
        flags: [],
        requestedAt: "2026-01-01T10:30:00",
        ipAddress: "192.168.1.45"
    },
    {
        id: "W-1002",
        transactionRef: "TXN-9921-5531",
        user: "SniperTrade",
        legalName: "Robert Smith",
        amount: 2500,
        bank: "SCB",
        account: "987-***-654",
        status: "PENDING",
        riskScore: 78,
        flags: ["High Amount", "New IP"],
        requestedAt: "2026-01-01T11:15:22",
        ipAddress: "10.0.0.12"
    },
    {
        id: "W-1003",
        transactionRef: "TXN-7732-0012",
        user: "AliceWonder",
        legalName: "Alice Cooper",
        amount: 150,
        bank: "BBL",
        account: "456-***-123",
        status: "APPROVED",
        riskScore: 5,
        flags: [],
        requestedAt: "2026-01-02T09:45:10",
        processedAt: "2026-01-02T09:48:15",
        ipAddress: "172.16.254.1"
    },
    {
        id: "W-1004",
        transactionRef: "TXN-3321-9988",
        user: "CryptoKing",
        legalName: "Somchai Jai-dee",
        amount: 10000,
        bank: "KTB",
        account: "000-***-999",
        status: "FLAGGED",
        riskScore: 95,
        flags: ["Unusual Activity", "Multiple Requests"],
        requestedAt: "2026-01-02T14:20:05",
        ipAddress: "203.0.113.5"
    },
];

export default function AdminFinancePage() {
    const [queue, setQueue] = useState<WithdrawalRequest[]>(MOCK_WITHDRAWALS);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [processingAction, setProcessingAction] = useState<"APPROVE_ALL" | "REJECT_ALL" | null>(null);
    const [dateFilter, setDateFilter] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    // Derived state for filtering
    const filteredQueue = queue.filter(item => {
        const itemDate = item.requestedAt.split('T')[0];
        const matchesDate = dateFilter ? itemDate === dateFilter : true;
        const matchesSearch = searchTerm ?
            (item.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.legalName.toLowerCase().includes(searchTerm.toLowerCase()))
            : true;
        return matchesDate && matchesSearch;
    });

    const handleAction = (id: string, action: "APPROVE" | "REJECT") => {
        setProcessingId(id);
        const now = new Date().toISOString().split('.')[0]; // Simulate server time

        setTimeout(() => {
            // Instead of removing, we update status and processedAt for better tracking
            setQueue(prev => prev.map(w => {
                if (w.id === id) {
                    return {
                        ...w,
                        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
                        processedAt: now // Stamp the time
                    };
                }
                return w;
            }));

            setProcessingId(null);
            if (action === "APPROVE") toast.success(`Withdrawal ${id} Approved`);
            else toast.error(`Withdrawal ${id} Rejected`);

            // Remove from selection if processed
            setSelectedItems(prev => prev.filter(sid => sid !== id));
        }, 1000);
    };

    const handleBulkAction = async (action: "APPROVE_ALL" | "REJECT_ALL") => {
        const targetItems = selectedItems.length > 0
            ? queue.filter(q => selectedItems.includes(q.id))
            : filteredQueue;

        const eligibleItems = targetItems.filter(q => q.status === "PENDING" && (action === "APPROVE_ALL" ? q.riskScore <= 70 : true));
        const count = eligibleItems.length;

        if (count === 0) {
            toast.error("No eligible pending requests to process.");
            return;
        }

        setProcessingAction(action);

        await new Promise(resolve => setTimeout(resolve, 1500));

        const now = new Date().toISOString().split('.')[0];
        const processedIds = new Set(eligibleItems.map(i => i.id));

        setQueue(prev => prev.map(w => {
            if (processedIds.has(w.id)) {
                return {
                    ...w,
                    status: action === "APPROVE_ALL" ? "APPROVED" : "REJECTED",
                    processedAt: now
                };
            }
            return w;
        }));

        setSelectedItems(prev => prev.filter(id => !processedIds.has(id)));

        toast.success(`${count} requests ${action === "APPROVE_ALL" ? "Approved" : "Rejected"}`);
        setProcessingAction(null);
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === filteredQueue.length && filteredQueue.length > 0) {
            setSelectedItems([]);
        } else {
            setSelectedItems(filteredQueue.map(i => i.id));
        }
    };

    const toggleSelectItem = (id: string) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(prev => prev.filter(i => i !== id));
        } else {
            setSelectedItems(prev => [...prev, id]);
        }
    };

    const formatDateTime = (isoString?: string) => {
        if (!isoString) return { date: "-", time: "-" };
        const [date, time] = isoString.split('T');
        return { date, time };
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header Stats */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <ShieldCheck className="text-blue-500" size={32} />
                    AI Risk Console
                </h2>
                <div className="flex gap-2">
                    <div className="bg-gray-900 border border-gray-800 p-2 rounded-xl flex items-center gap-2 px-4 shadow-sm">
                        <Activity size={16} className="text-green-500 animate-pulse" />
                        <span className="text-xs font-bold text-gray-400">System Normal</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                    <h3 className="text-gray-500 text-xs font-bold uppercase">Pending Requests</h3>
                    <p className="text-2xl font-bold text-white mt-1">{queue.filter(q => q.status === "PENDING").length}</p>
                </div>
                <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                    <h3 className="text-gray-500 text-xs font-bold uppercase">Today's Payout</h3>
                    <p className="text-2xl font-bold text-blue-400 mt-1">$48,250</p>
                </div>
                <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                    <h3 className="text-gray-500 text-xs font-bold uppercase">High Risk Flagged</h3>
                    <p className="text-2xl font-bold text-red-500 mt-1">{queue.filter(q => q.riskScore > 70).length}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 p-5 rounded-2xl border border-blue-500/30">
                    <h3 className="text-blue-200 text-xs font-bold uppercase flex items-center gap-2"><Activity size={12} /> AI Analysis Cost</h3>
                    <p className="text-2xl font-bold text-white mt-1">45ms <span className="text-xs text-gray-400 font-normal">avg/req</span></p>
                </div>
            </div>

            {/* AI Withdrawal Queue */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-md border border-gray-800 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <h3 className="font-bold text-white whitespace-nowrap">Live Queue</h3>
                        {selectedItems.length > 0 && <Badge variant="secondary">{selectedItems.length} selected</Badge>}
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Bulk Actions */}
                        {filteredQueue.length > 0 && (
                            <div className="flex gap-2 mr-2">
                                <button
                                    onClick={() => handleBulkAction("REJECT_ALL")}
                                    disabled={!!processingAction}
                                    className="text-xs font-bold text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processingAction === "REJECT_ALL" && <Loader2 className="animate-spin" size={14} />}
                                    Reject
                                </button>
                                <button
                                    onClick={() => handleBulkAction("APPROVE_ALL")}
                                    disabled={!!processingAction}
                                    className="text-xs font-bold text-green-400 hover:text-green-300 px-3 py-2 rounded-lg hover:bg-green-900/20 transition-colors border border-green-900/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processingAction === "APPROVE_ALL" && <Loader2 className="animate-spin" size={14} />}
                                    Approve Safe
                                </button>
                                <div className="h-4 w-px bg-gray-700 mx-1 self-center"></div>
                            </div>
                        )}

                        {/* Filters */}
                        <div className="flex gap-2 flex-1 md:flex-none">
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" size={16} />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="bg-gray-950 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:border-blue-500 outline-none w-auto hover:bg-gray-900 transition-colors cursor-pointer"
                                />
                            </div>
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" size={16} />
                                <input
                                    placeholder="Search ID, Name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-gray-950 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-blue-500 outline-none w-full"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Table>
                    <TableHeader className="bg-gray-950/50">
                        <TableRow className="border-gray-800 hover:bg-transparent">
                            <TableHead className="w-[40px]">
                                <Checkbox
                                    checked={filteredQueue.length > 0 && selectedItems.length === filteredQueue.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Account Info</TableHead>
                            <TableHead>Banking</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Processed</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Risk Analysis</TableHead>
                            <TableHead className="text-center">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredQueue.map((item) => {
                            const isHighRisk = item.riskScore > 70;
                            const isMedRisk = item.riskScore > 20 && item.riskScore <= 70;
                            const reqTime = formatDateTime(item.requestedAt);
                            const procTime = formatDateTime(item.processedAt);

                            return (
                                <TableRow key={item.id} className="border-gray-800 hover:bg-gray-800/50 data-[state=selected]:bg-gray-800" data-state={selectedItems.includes(item.id) ? "selected" : ""}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedItems.includes(item.id)}
                                            onCheckedChange={() => toggleSelectItem(item.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-mono text-white text-xs font-bold">{item.id}</span>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                                                <Hash size={10} />
                                                {item.transactionRef}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white">{item.legalName}</span>
                                            <span className="text-xs text-blue-400">@{item.user}</span>
                                            <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                                                <Globe size={10} />
                                                <span className="font-mono">{item.ipAddress}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top py-4">
                                        <div className="text-xs text-gray-300">
                                            <p className="font-bold text-white">{item.bank}</p>
                                            <p className="font-mono text-gray-500">{item.account}</p>
                                        </div>
                                    </TableCell>

                                    {/* REQUESTED TIMELINE */}
                                    <TableCell className="align-top py-4">
                                        <div className="flex flex-col text-xs border-l-2 border-blue-500/30 pl-3">
                                            <span className="text-gray-300 font-medium">{reqTime.date}</span>
                                            <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                                                <Clock size={10} />
                                                <span className="font-mono">{reqTime.time}</span>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* PROCESSED TIMELINE */}
                                    <TableCell className="align-top py-4">
                                        {item.processedAt ? (
                                            <div className={`flex flex-col text-xs border-l-2 pl-3 ${item.status === "APPROVED" ? "border-green-500/30" : "border-red-500/30"}`}>
                                                <span className="text-gray-300 font-medium">{procTime.date}</span>
                                                <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                                                    <Clock size={10} />
                                                    <span className="font-mono">{procTime.time}</span>
                                                </div>
                                                <Badge variant={item.status === "APPROVED" ? "success" : "destructive_soft"} className="w-fit mt-1 text-[9px] px-1 h-4">
                                                    {item.status}
                                                </Badge>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-600 italic pl-3 border-l-2 border-gray-800">Pending...</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="align-top py-4 font-mono font-bold text-white text-sm">
                                        ${item.amount.toLocaleString()}
                                    </TableCell>

                                    {/* AI SCORE COLUMN */}
                                    <TableCell className="align-top py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                                                <svg className="w-full h-full transform -rotate-90">
                                                    <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-800" />
                                                    <circle cx="18" cy="18" r="14" stroke={isHighRisk ? "#ef4444" : isMedRisk ? "#eab308" : "#22c55e"} strokeWidth="3" fill="transparent" strokeDasharray={88} strokeDashoffset={88 - (88 * item.riskScore) / 100} className="transition-all duration-1000" />
                                                </svg>
                                                <span className={`absolute text-[9px] font-bold ${isHighRisk ? "text-red-500" : isMedRisk ? "text-yellow-500" : "text-green-500"}`}>{item.riskScore}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <Badge variant={isHighRisk ? "destructive_soft" : isMedRisk ? "warning" : "success"} className="mb-1 text-[9px] h-5 w-fit">
                                                    {isHighRisk ? "High Risk" : isMedRisk ? "Review" : "Safe"}
                                                </Badge>
                                                {item.flags.length > 0 && <p className="text-[9px] text-gray-400 flex items-center gap-1 truncate max-w-[100px]"><AlertTriangle size={8} /> {item.flags[0]}</p>}
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="align-top py-4 text-center">
                                        {processingId === item.id ? (
                                            <div className="flex justify-center mt-1"><RefreshCcw className="animate-spin text-blue-500" size={18} /></div>
                                        ) : item.status === "PENDING" ? (
                                            <div className="flex justify-center gap-1.5 mt-1">
                                                <button
                                                    onClick={() => handleAction(item.id, "REJECT")}
                                                    className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                                                    title="Reject"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => !isHighRisk && handleAction(item.id, "APPROVE")}
                                                    className={`p-1.5 rounded-lg transition-colors ${isHighRisk ? "text-gray-600 cursor-not-allowed" : "text-green-500 hover:bg-green-900/30 hover:text-green-400"}`}
                                                    title="Approve"
                                                    disabled={isHighRisk}
                                                >
                                                    {isHighRisk ? <AlertOctagon size={16} /> : <CheckCircle2 size={16} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-center mt-1">
                                                {item.status === "APPROVED" ?
                                                    <CheckCircle2 size={18} className="text-gray-700" /> :
                                                    <XCircle size={18} className="text-gray-700" />
                                                }
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}

                        {filteredQueue.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-gray-500">
                                    <div className="flex flex-col items-center justify-center p-4">
                                        <CheckCircle2 size={32} className="text-gray-800 mb-2" />
                                        <p>No matching withdrawals found.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Pagination Footer */}
                <div className="flex items-center justify-between px-4 py-4 border-t border-gray-800 bg-gray-900/50">
                    <div className="flex-1 text-sm text-gray-500">
                        {selectedItems.length} of {filteredQueue.length} row(s) selected
                    </div>
                    <div className="flex items-center gap-4 lg:gap-8">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-500 hidden sm:block">Rows per page</p>
                            <select
                                value={rowsPerPage}
                                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                                className="h-8 w-[70px] rounded-md border border-gray-800 bg-gray-950 text-gray-300 text-sm focus:outline-none focus:border-blue-500 px-2"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        <div className="flex w-[100px] items-center justify-center text-sm font-medium text-gray-300">
                            Page {currentPage} of 1
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
