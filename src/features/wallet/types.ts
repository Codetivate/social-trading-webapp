export type TransactionType = "EARNING" | "WITHDRAWAL" | "REFUND";
export type TransactionStatus = "LOCKED" | "AVAILABLE" | "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";

export interface Transaction {
    id: string;
    type: TransactionType;
    title: string; // "Earnings from Alice" or "Withdrawal to KBank"
    amount: number;
    date: number; // Timestamp
    status: TransactionStatus;
    releaseDate?: number; // When it unlocks (for earnings)
    meta?: any; // Extra data (bank details etc)
}
