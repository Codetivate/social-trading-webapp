"use client"

import { useState } from "react"
import { connectBroker } from "@/app/actions/broker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export function ConnectBrokerForm() {
    const [isLoading, setIsLoading] = useState(false)
    const [search, setSearch] = useState("")
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedServer, setSelectedServer] = useState("")

    // MOCK DATA Reuse (ideally move to shared constant)
    // MOCK DATA Reuse (ideally move to shared constant)
    const MOCK_BROKERS = [
        "Exness-MT5Real", "Exness-MT5Trial",
        "XMGlobal-MT5-Real", "XMGlobal-MT5-Demo",
        "ICMarkets-MT5-Live", "ICMarkets-MT5-Demo",
        "Pepperstone-MT5-01", "Pepperstone-MT5-02",
        "FPMarkets-Live", "FPMarkets-Demo",
        "RoboForex-Pro", "RoboForex-ECN",
        "JustForex-Live", "Alpari-MT5-Real",
        "PiSecurities-Live", "PiSecurities-Demo",
        "TopTraderCo-Live", "TopTraderCo-Demo"

    ]
    const filteredBrokers = MOCK_BROKERS.filter(b => b.toLowerCase().includes(search.toLowerCase()))

    const handleSelectServer = (server: string) => {
        setSelectedServer(server)
        setSearch(server)
        setShowSuggestions(false)
    }

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        try {
            // Call Server Action
            const result = await connectBroker(formData)

            if (result.success) {
                toast.success("Broker Connected!", {
                    description: "Your account is now linked securely."
                })
                // Optional: Refresh/Redirect would be handled by parent or page reload
                window.location.reload()
            } else {
                toast.error("Connection Failed", {
                    description: result.error
                })
            }
        } catch (error) {
            toast.error("Something went wrong")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="bg-gray-950 border border-gray-700 p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-white mb-2">Link MT5 Account</h3>

            <form action={handleSubmit} className="space-y-3">
                {/* Server Search */}
                <div className="relative">
                    <input
                        name="server"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-green-500 transition-colors"
                        placeholder="Search Server..."
                        value={search}
                        onFocus={() => setShowSuggestions(true)}
                        onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                        autoComplete="off"
                    />
                    {showSuggestions && (
                        <div className="absolute top-full left-0 w-full bg-gray-800 border border-gray-700 max-h-32 overflow-y-auto z-10 rounded-b-lg shadow-xl">
                            {filteredBrokers.map((b, i) => (
                                <div key={i} className="p-2 text-xs hover:bg-gray-700 cursor-pointer text-gray-300" onClick={() => handleSelectServer(b)}>
                                    {b}
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Hidden input to ensure value is submitted if user types manually or selects */}
                    {/* Actually 'name="server"' on the visible input works if we control the value, but let's be safe */}
                </div>

                <input
                    name="login"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-green-500 transition-colors"
                    type="number"
                    placeholder="Login ID"
                    required
                />

                <input
                    name="password"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-green-500 transition-colors"
                    type="password"
                    placeholder="Password"
                    required
                />

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Connect Now"}
                </button>
            </form>
        </div>
    )
}
