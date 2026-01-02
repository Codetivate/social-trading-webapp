
import { Signal } from "@prisma/client";

/**
 * 🧠 AI Analyst Logic
 * Calculates Risk Score and Tags based on trade history.
 * Pure function logic (no DB calls here).
 */
export class Analyst {

    /**
     * Calculates a Risk Score from 0 (Safe) to 100 (High Risk).
     * Based on: Drawdown, Leverage, Trade Duration, Win Rate.
     */
    static calculateRiskScore(trades: Signal[], currentEquity: number, maxEquity: number): number {
        if (trades.length === 0) return 0;

        let score = 50; // Base Score

        // 1. Drawdown Impact (Max 40 pts)
        const drawdown = ((maxEquity - currentEquity) / maxEquity) * 100;
        score += Math.min(drawdown * 2, 40);

        // 2. High Leverage Check (Max 30 pts)
        // Heuristic: If volume > 1.0 for a $10k account, that's high risk.
        // Approx: volume * 10000 / equity
        const avgVolume = trades.reduce((sum, t) => sum + (t.volume || 0), 0) / trades.length;
        if (avgVolume > 0.5) score += 10;
        if (avgVolume > 1.0) score += 20;

        // 3. Win Rate Bonus (Reduces Risk)
        const wins = trades.filter(t => (t.price && t.tp && t.price >= t.tp) || (t.type === "BUY" && t.price && t.price > 0)).length; // Simplified win check
        // Real win check requires 'profit' field which we might not have in Signal table perfectly yet.
        // For now, let's assume we don't reduce score blindly.

        // Cap at 100
        return Math.min(Math.round(score), 100);
    }

    /**
     * Generates descriptive tags like "Scalper", "Day Trader", "High Risk".
     */
    static generateTags(trades: Signal[]): string[] {
        const tags: Set<string> = new Set();
        if (trades.length < 5) return ["Newbie"];

        // 1. Timeframe Analysis
        // (Requires close time, which we need to track better. For now assuming short term)
        tags.add("Intraday");

        // 2. Volume Analysis
        const avgVolume = trades.reduce((sum, t) => sum + (t.volume || 0), 0) / trades.length;
        if (avgVolume > 1.0) tags.add("Whale 🐳");
        if (avgVolume < 0.1) tags.add("Micro Account");

        // 3. Symbol Preference
        const cryptos = trades.filter(t => t.symbol.includes("BTC") || t.symbol.includes("ETH")).length;
        if (cryptos / trades.length > 0.5) tags.add("Crypto King ₿");

        const gold = trades.filter(t => t.symbol.includes("XAU")).length;
        if (gold / trades.length > 0.5) tags.add("Gold Bug 🥇");

        return Array.from(tags);
    }
}
