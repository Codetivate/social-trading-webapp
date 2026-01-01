
export const CURRENT_USER_DATA = {
    name: "Alex Trader",
    email: "alex.trader@gmail.com",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    wallet: "0x123...456",
    broker: "Exness-Real-05",
    account: "10523819",
    isNewVip: true,
    goldenTickets: 1,
    masterProfile: {
        name: "Master Keng",
        desc: "Full-time Scalper. I trade London & NY sessions. Disciplined risk management.",
        tags: ["Scalping", "Gold", "Manual"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Keng",
        tier: "ROOKIE" as const,
        followersCount: 48,
        followersLimit: 50,
        aum: 48000,
        aumLimit: 50000,
        monthlyFee: 0
    }
};
