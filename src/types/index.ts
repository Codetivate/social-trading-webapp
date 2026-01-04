export type UserRole = "FOLLOWER" | "MASTER";
export type AccountStatus = "CONNECTED" | "ERROR" | "DISCONNECTED";
export type SessionType = "DAILY" | "TRIAL_7DAY" | "PAID";

export interface Master {
    id: number;
    userId?: string;
    masterUserId?: string; // ✅ Diagnostics Mapping
    name: string;
    type: "AI_BOT" | "HUMAN";
    winRate: number;
    roi: number;
    leverage?: number; // ✅ New
    riskReward?: number; // ✅ New
    pnlText: string;
    followers: number;
    aum?: number; // ✅ Added AUM
    balance: number;
    risk: number;
    drawdown: number;
    profitFactor: number;
    avatar: string;
    desc: string;
    tags: string[];
    joined: string;
    currentOrders: Order[];
    monthlyFee: number;
    minDeposit?: number; // ✅ Added
    isPremium: boolean;
    isPublic?: boolean; // ✅ Added
}

export interface Order {
    symbol: string;
    type: "BUY" | "SELL";
    lot: number;
    entry: number;
    current: number;
    pnl: number;
}

export interface Session {
    id: number;
    master: Master;
    allocation: number;
    risk: number | string;
    startTime: number;
    pnl: number;
    unrealizedPnL?: number; // ⚡ Real-Time Floating PnL
    orders: Order[];
    isTrial: boolean;
    type: SessionType;
    expiry: number | null;
}

export interface Follower {
    id: number;
    name: string;
    equity: number;
    pnl: string;
    joined: string;
    avatar: string;
}

export interface MasterProfile {
    userId: string; // ✅ Added
    name: string;
    desc: string;
    tags: string[];
    avatar: string;
    tier: "ROOKIE" | "PRO" | "TYCOON";
    followersCount: number;
    followersLimit: number;
    aum: number;
    aumLimit: number;
    monthlyFee: number;
    minDeposit?: number; // ✅ Added
    isPublic?: boolean; // ✅ Added
}
