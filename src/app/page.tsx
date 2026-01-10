"use server";

import { SocialTradingApp } from "@/features/social/components/SocialTradingApp";
import { getBrokerAccount } from "@/app/actions/broker";
import { auth } from "@/auth";
import { SessionProvider } from "next-auth/react";

import { fetchMasters } from "@/app/actions/data";

export default async function BridgeTradeApp() {
    // ⚡ PRE-FETCH BROKER STATE & MASTERS (SSR)
    const session = await auth();

    const [brokerAccount, masters] = await Promise.all([
        getBrokerAccount().catch(() => null),
        fetchMasters().catch(() => [])
    ]);

    // 🚀 PRELOAD MASTER DATA (If Logged In as Master)
    let initialMaster = null;
    let initialAnalytics = null;

    if (session?.user?.id) {
        // We need to know if the user is a master and their username.
        // We can use getUserProfile (which is also efficient) or just assume if they are in the masters list?
        // But masters list only has TOP masters.
        // Let's use getUserProfile to be safe.
        const { getUserProfile } = await import("@/app/actions/user");
        const { fetchMasterByUsername } = await import("@/app/actions/data");
        const { getAnalytics } = await import("@/app/actions/analytics");
        const { subMonths } = await import("date-fns");

        const userProfile = await getUserProfile(session.user.id);

        if (userProfile && userProfile.role === "MASTER" && userProfile.masterProfile?.username) {
            const username = userProfile.masterProfile.username || "";
            if (username) {
                initialMaster = await fetchMasterByUsername(username).catch(() => null);
            }

            if (initialMaster && initialMaster.userId) {
                initialAnalytics = await getAnalytics(
                    initialMaster.userId,
                    subMonths(new Date(), 3),
                    new Date()
                ).catch(() => null);
            }
        }
    }

    return (
        <SessionProvider session={session}>
            <SocialTradingApp
                initialBrokerAccount={brokerAccount}
                initialMasters={masters}
                initialMaster={initialMaster}
                initialAnalytics={initialAnalytics}
            />
        </SessionProvider>
    );
}
