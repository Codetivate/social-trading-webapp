"use server";

import { SocialTradingApp } from "@/features/social/components/SocialTradingApp";
import { getBrokerAccount } from "@/app/actions/broker";
import { auth } from "@/auth";
import { SessionProvider } from "next-auth/react";

import { getAnalytics } from "@/app/actions/analytics";
import { fetchMasterByUsername } from "@/app/actions/data";
import { subMonths } from "date-fns";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    const session = await auth();

    // 1. Start Broker Fetch (Independent)
    const brokerPromise = getBrokerAccount().catch(() => null);

    // 2. Fetch Master (Needed for ID)
    const master = await fetchMasterByUsername(username).catch(() => null);

    // 3. Fetch Analytics (Dependent on Master ID)
    let analytics = null;
    if (master && master.userId) {
        analytics = await getAnalytics(
            master.userId,
            subMonths(new Date(), 3),
            new Date()
        ).catch(() => null);
    }

    // 4. Resolve Broker
    const brokerAccount = await brokerPromise;

    return (
        <SessionProvider session={session}>
            <SocialTradingApp
                initialSlug={username}
                initialBrokerAccount={brokerAccount}
                initialMaster={master} // ✅ Pass Prefetched Master
                initialAnalytics={analytics} // ✅ Pass Prefetched Analytics
            />
        </SessionProvider>
    );
}
