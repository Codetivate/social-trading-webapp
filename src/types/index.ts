export type UserRole = "FOLLOWER" | "MASTER";
export type AccountStatus = "CONNECTED" | "ERROR";
export type SessionType = "DAILY" | "TRIAL_7DAY" | "GOLDEN" | "PAID" | "VIP";

export interface Master {
    id: number;
    name: string;
    type: "AI_BOT" | "HUMAN";
    winRate: number;
    roi: number;
    pnlText: string;
    followers: number;
    balance: number;
    risk: number;
    drawdown: number;
    profitFactor: number;
    avatar: string;
    isVip: boolean;
    desc: string;
    tags: string[];
    joined: string;
    currentOrders: Order[];
    monthlyFee: number;
    isPremium: boolean;
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
}
