import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 🛡️ FUTURE: Rate Limiting Logic Here
// import { ratelimit } from '@/lib/ratelimit';

export async function middleware(request: NextRequest) {
    // 1. Check if accessing Public API
    if (request.nextUrl.pathname.startsWith('/api/v1')) {
        // TODO: Implement Token Bucket here
        // const ip = request.ip ?? '127.0.0.1';
        // const { success } = await ratelimit.limit(ip);
        // if (!success) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    return NextResponse.next()
}

export const config = {
    matcher: '/api/v1/:path*',
}
