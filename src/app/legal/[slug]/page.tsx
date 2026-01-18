"use client";

import React, { use } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, FileText, Lock, AlertTriangle, Scale } from "lucide-react";

export default function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);

    const contentMap: any = {
        "terms-of-service": {
            title: "Terms of Service",
            icon: <FileText size={48} className="text-blue-500" />,
            updated: "January 15, 2026",
            content: (
                <>
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">1. Nature of Services</h3>
                        <p className="text-gray-400">
                            Welcome to SignalTrade. By accessing our platform, you acknowledge that SignalTrade operates exclusively as a <strong>technology infrastructure provider</strong>. Our services are limited to the provision of cloud-based Virtual Private Server (VPS) environments and software bridges designed to facilitate the transmission of data between trading terminals.
                        </p>
                        <p className="bg-blue-500/10 border-l-4 border-blue-500 p-4 text-blue-200 text-sm">
                            We do not provide investment advice, portfolio management, or financial analysis. All trading decisions remain the sole responsibility of the user.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">2. User Responsibilities</h3>
                        <p className="text-gray-400">
                            Users agree to utilize our platform in compliance with all applicable local laws and regulations. As a user, you retain full control and authority over your connected brokerage accounts. SignalTrade never holds, manages, or has direct access to withdraw funds from your brokerage accounts.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">3. Service Reliability & Liability</h3>
                        <p className="text-gray-400">
                            SignalTrade services are provided on an <strong>"as is"</strong> and <strong>"as available"</strong> basis without warranties of any kind. Internet-based technical infrastructure is subject to inherent risks including latency, power failure, and connectivity issues. SignalTrade expressly disclaims liability for any financial loss resulting from technical anomalies, third-party broker failures, or market volatility.
                        </p>
                    </section>
                </>
            )
        },
        "privacy-policy": {
            title: "Privacy Policy",
            icon: <Lock size={48} className="text-green-500" />,
            updated: "January 15, 2026",
            content: (
                <>
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">1. Data Minimization Commitment</h3>
                        <p className="text-gray-400">
                            We value your privacy and practice strict data minimization. We only process technical data required to bridge signals (such as Trade Ticket IDs and Opening Prices). We do not collect or store your personal banking credentials, government IDs, or withdrawal passwords.
                        </p>
                    </section>
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">2. Security Architecture</h3>
                        <p className="text-gray-400">
                            Your trading configurations are encrypted using industry-standard AES-256 protocols. Our infrastructure is hosted in secure, isolated containers to prevent cross-contamination of data. We do not sell, rent, or share your trading data with third-party marketers.
                        </p>
                    </section>
                </>
            )
        },
        "risk-disclaimer": {
            title: "Risk Disclosure",
            icon: <AlertTriangle size={48} className="text-red-500" />,
            updated: "January 15, 2026",
            content: (
                <>
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">1. General Risk Warning</h3>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                            <p className="text-red-200 font-medium leading-relaxed">
                                Trading financial instruments on margin carries a high level of risk and may not be suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade, you should carefully consider your investment objectives, level of experience, and risk appetite.
                            </p>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">2. Social Trading Risks</h3>
                        <p className="text-gray-400">
                            "Copy Trading" or "Social Trading" features allow you to automate trading by following other users. Past performance of a Master Trader is not indicative of future results. There is no guarantee that you will achieve profits similar to those shown.
                        </p>
                        <p className="text-gray-400">
                            You acknowledge that SignalTrade merely provides the <strong>conduit</strong> for these signals and does not vet, endorse, or guarantee the performance of any signal provider.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xl font-bold text-white">3. Independent Judgment</h3>
                        <p className="text-gray-400">
                            By using this service, you agree that you are solely responsible for your own investment research and decisions. You should seek advice from an independent financial advisor if you have any doubts.
                        </p>
                    </section>
                </>
            )
        }
    };

    const doc = contentMap[slug] || {
        title: "Legal Information",
        icon: <Scale size={48} className="text-gray-500" />,
        content: (
            <div className="text-center space-y-4">
                <p>Please select a document to view.</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <Link href="/legal/terms-of-service" className="text-blue-400 hover:text-white underline">Terms of Service</Link>
                    <Link href="/legal/privacy-policy" className="text-blue-400 hover:text-white underline">Privacy Policy</Link>
                    <Link href="/legal/risk-disclaimer" className="text-blue-400 hover:text-white underline">Risk Disclosure</Link>
                </div>
            </div>
        )
    };

    return (
        <div className="min-h-screen bg-[#020202] text-gray-300 font-sans selection:bg-purple-500/30">
            {/* Header */}
            <div className="border-b border-white/5 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-white transition-colors group">
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Back to App
                    </Link>
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={12} />
                        Compliance Centre
                    </span>
                </div>
            </div>

            <main className="max-w-3xl mx-auto px-6 py-12 md:py-20">
                {/* Document Header */}
                <div className="mb-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-center mb-6 p-4 bg-white/5 w-fit mx-auto rounded-3xl ring-1 ring-white/10 shadow-2xl shadow-blue-900/10">
                        {doc.icon}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">{doc.title}</h1>
                    {doc.updated && (
                        <p className="text-sm text-gray-500 font-mono bg-white/5 inline-block px-3 py-1 rounded-full border border-white/5">
                            Last Revised: {doc.updated}
                        </p>
                    )}
                </div>

                {/* Document Content */}
                <div className="space-y-10 text-lg leading-loose text-gray-300 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
                    {doc.content}
                </div>

                {/* Footer */}
                <div className="mt-20 pt-10 border-t border-white/5 text-center space-y-4">
                    <div className="flex justify-center gap-6 text-sm font-bold text-gray-500">
                        <Link href="/legal/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
                        <Link href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
                        <Link href="/legal/risk-disclaimer" className="hover:text-white transition-colors">Risk</Link>
                    </div>
                    <p className="text-xs text-gray-600 max-w-xl mx-auto leading-relaxed">
                        SignalTrade is a software development company. We are not a registered broker-dealer or investment advisor.
                        The services provided are strictly limited to technical automated signal bridging.
                        Copyright © 2026 SignalTrade. All rights reserved.
                    </p>
                </div>
            </main>
        </div>
    );
}
