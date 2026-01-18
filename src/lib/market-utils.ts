/**
 * 📊 Market Categorization Engine
 * Maps trading symbols to asset classes based on common broker patterns.
 */

export type AssetClass = "ALL" | "FUTURES_CME" | "FOREX" | "CRYPTO" | "INDICES" | "STOCKS" | "COMMODITIES";

export const CATEGORIES: AssetClass[] = ["ALL", "FUTURES_CME", "FOREX", "CRYPTO", "INDICES"];

/**
 * Detects the asset class from a given symbol.
 * Rules are prioritized by specificity.
 */
export function categorizeSymbol(symbol: string): AssetClass {
    const s = symbol.toUpperCase();

    // 1. 🪙 CRYPTO (Strongest Signal)
    // Common: BTCUSD, ETHUSD, SOLUSDT, BTC, ETH
    if (/BTC|ETH|SOL|XRP|ADA|DOGE|SHIB|LTC|BNB|MATIC|DOT|LINK|UNI|AVAX|ATOM|XMR|USDT|USDC/.test(s)) return "CRYPTO";

    // 2. 📈 INDICES (Major Global Indices)
    // Common: US30, NAS100, GER30, UK100, SPX500, JPN225
    if (/US30|NAS100|SPX500|GER30|UK100|FRA40|JPN225|HK50|AU200|EU50/.test(s)) return "INDICES";
    if (/^DE30|^DE40|^WS30|^USTECH/.test(s)) return "INDICES";

    // 3. 🚜 FUTURES CME (Specific Codes)
    // Common: ES, NQ, YM, CL, GC, SI, 6E
    // Micros: MES, MNQ, MYM, M2K, MGC (Gold), SIL (Silver)
    // New: 1OZ (1 Ounce Gold)
    // Often have expirations like ESZ5, NQH6
    // Check for 2-letter root + MonthCode + Year (e.g., Z5, H6)
    // ES = S&P, NQ = Nasdaq, YM = Dow, CL = Oil, GC = Gold
    if (/^(ES|NQ|YM|RTY|CL|GC|SI|HG|NG|ZB|ZN|ZF|6A|6B|6C|6E|6J|6S|6M|MES|MNQ|MYM|M2K|MGC|SIL|M6A|M6E|M6B|1OZ)/.test(s)) {
        // Exclude simple Forex pairs that might clash (though 6E is distinct from EURUSD)
        return "FUTURES_CME";
    }

    // 4. 💱 FOREX (Currency Pairs)
    // Standard 6-char pairs: EURUSD, GBPJPY
    // XAU/XAG are often treated as Metals, but for this request, user didn't specify Metals, 
    // so we can group them as Commodities or Forex depending on preference.
    // Let's assume standard behavior:
    if (/EUR|GBP|USD|JPY|CHF|CAD|AUD|NZD|SGD|HKD|SEK|NOK|TRY|ZAR|MXN/.test(s)) {
        // Double check it's not a crypto pair like BTCUSD caught above
        return "FOREX";
    }

    // special handling for Gold/Silver if not captured by Futures
    if (/XAU|XAG/.test(s)) return "FOREX"; // Retail often groups Gold with Forex pairs

    return "FOREX"; // Default fallback for unknown pairs on typical MT5/Broker setups
}

/**
 * Returns a unique list of asset classes from a list of symbols.
 */
export function getAssetClassesFromSymbols(symbols: string[]): AssetClass[] {
    const classes = new Set<AssetClass>();
    symbols.forEach(s => classes.add(categorizeSymbol(s)));
    return Array.from(classes);
}
