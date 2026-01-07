import { SocialTradingApp } from "@/features/social/components/SocialTradingApp";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    return <SocialTradingApp initialSlug={username} />;
}
