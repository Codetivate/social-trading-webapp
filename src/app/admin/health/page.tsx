import { Activity, CheckCircle2, AlertTriangle } from "lucide-react"

export default function AdminHealthPage() {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">System Health & AI Nodes</h2>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-500/10 rounded-xl"><Activity className="text-green-500" /></div>
                            <div><h3 className="font-bold text-white">Trade Copier Engine</h3><p className="text-xs text-gray-400">Latency: 45ms</p></div>
                        </div>
                        <span className="bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-full">OPERATIONAL</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-500/10 rounded-xl"><CheckCircle2 className="text-green-500" /></div>
                            <div><h3 className="font-bold text-white">AI Risk Guard</h3><p className="text-xs text-gray-400">Processing 142 sessions</p></div>
                        </div>
                        <span className="bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-full">OPERATIONAL</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-yellow-500/10 rounded-xl"><AlertTriangle className="text-yellow-500" /></div>
                            <div><h3 className="font-bold text-white">MetaAPI Gateway #2</h3><p className="text-xs text-gray-400">High Load (89%)</p></div>
                        </div>
                        <span className="bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full">WARNING</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
