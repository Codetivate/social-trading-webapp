"use client";

import { Activity, DollarSign, Users, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminDashboard() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* 1. Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Total Revenue"
                    value="$48,250"
                    sub="+12% from last month"
                    icon={<DollarSign size={24} className="text-green-500" />}
                    trend="up"
                />
                <MetricCard
                    title="Active Masters"
                    value="142"
                    sub="+5 new this week"
                    icon={<TrendingUp size={24} className="text-blue-500" />}
                    trend="up"
                />
                <MetricCard
                    title="Followers Active"
                    value="3,840"
                    sub="-2% churn rate"
                    icon={<Users size={24} className="text-purple-500" />}
                    trend="down"
                />
                <MetricCard
                    title="Total Volume (Lot)"
                    value="892.5"
                    sub="Daily Average"
                    icon={<Activity size={24} className="text-orange-500" />}
                    trend="up"
                />
            </div>

            {/* 2. Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="font-bold text-lg">Revenue Overview</h3>
                            <p className="text-xs text-gray-400">Monthly subscription & fee collection</p>
                        </div>
                        <select className="bg-gray-800 border-gray-700 text-xs rounded-lg px-2 py-1"><option>Last 30 Days</option><option>Last Year</option></select>
                    </div>
                    <div className="h-64 flex items-end justify-between gap-2 px-2">
                        {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
                            <div key={i} className="w-full bg-blue-900/20 rounded-t-sm relative group">
                                <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm transition-all duration-500 hover:bg-blue-400" style={{ height: `${h}%` }}></div>
                                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-xs px-2 py-1 rounded shadow-lg pointer-events-none">${h}k</div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-4 text-xs text-gray-500 font-mono">
                        <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
                    </div>
                </div>

                {/* Fault Detection / AI Status */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Activity size={18} className="text-red-500" /> System Health</h3>

                    <div className="space-y-4 flex-1">
                        <HealthItem label="AI Guard Node" status="Operational" color="green" />
                        <HealthItem label="Trade Copier Engine" status="High Load" color="yellow" />
                        <HealthItem label="MetaAPI Gateway 1" status="Operational" color="green" />
                        <HealthItem label="MetaAPI Gateway 2" status="Operational" color="green" />
                        <HealthItem label="Risk Manager Bot" status="Operational" color="green" />
                    </div>

                    <div className="mt-6 bg-red-900/10 border border-red-500/20 p-4 rounded-xl">
                        <h4 className="text-red-500 text-xs font-bold uppercase mb-2">Fault Detection</h4>
                        <div className="text-xs text-gray-400 space-y-1">
                            <p className="flex justify-between"><span>High Latency (Server 2)</span> <span className="text-white">124ms</span></p>
                            <p className="flex justify-between"><span>Slippage Warning</span> <span className="text-white">EURUSD</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Recent Transactions Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Recent Financials</h3>
                    <button className="text-xs text-blue-400 font-bold hover:text-blue-300">View All</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-950/50 uppercase font-bold text-xs">
                            <tr>
                                <th className="px-4 py-3">ID</th>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Amount</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-4 font-mono text-gray-500 whitespace-nowrap">#TRX-882{i}</td>
                                    <td className="px-4 py-4 text-white font-medium whitespace-nowrap">User {100 + i}</td>
                                    <td className="px-4 py-4 whitespace-nowrap">{i % 2 === 0 ? "Subscription" : "Withdrawal"}</td>
                                    <td className={`px-4 py-4 font-bold whitespace-nowrap ${i % 2 === 0 ? "text-green-400" : "text-white"}`}>{i % 2 === 0 ? "+" : "-"}${i * 50}.00</td>
                                    <td className="px-4 py-4 whitespace-nowrap"><span className={`px-2 py-1 rounded text-[10px] font-bold ${i === 2 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>{i === 2 ? "PENDING" : "COMPLETED"}</span></td>
                                    <td className="px-4 py-4 text-xs whitespace-nowrap">Jan 0{i}, 2026</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, sub, icon, trend }: { title: string, value: string, sub: string, icon: any, trend: "up" | "down" }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col justify-between hover:border-gray-700 transition-colors">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-gray-800 rounded-xl">{icon}</div>
                {trend === "up" ? <div className="text-green-500 flex items-center text-xs font-bold gap-1 bg-green-500/10 px-2 py-0.5 rounded"><ArrowUpRight size={14} /> +12%</div> : <div className="text-red-500 flex items-center text-xs font-bold gap-1 bg-red-500/10 px-2 py-0.5 rounded"><ArrowDownRight size={14} /> -2%</div>}
            </div>
            <div>
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wide">{title}</h3>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{sub}</p>
            </div>
        </div>
    )
}

function HealthItem({ label, status, color }: { label: string, status: string, color: string }) {
    const colorClass = color === "green" ? "bg-green-500" : color === "yellow" ? "bg-yellow-500" : "bg-red-500";
    const textClass = color === "green" ? "text-green-400" : color === "yellow" ? "text-yellow-400" : "text-red-400";

    return (
        <div className="flex justify-between items-center text-sm border-b border-gray-800 pb-2 last:border-0 last:pb-0">
            <span className="text-gray-300">{label}</span>
            <span className={`flex items-center gap-2 font-bold ${textClass} text-xs uppercase`}>
                <div className={`w-2 h-2 rounded-full ${colorClass} animate-pulse`}></div> {status}
            </span>
        </div>
    )
}
