import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api` : 'http://localhost:3000/api';
const SECRET = process.env.BROKER_SECRET;

async function testAuth() {
    if (!SECRET) {
        console.error("❌ BROKER_SECRET not found in environment.");
        return;
    }

    console.log(`Testing API Auth with Secret: ${SECRET.substring(0, 3)}... and URL: ${API_URL}`);

    try {
        // Test GET /api/user/broker
        const response = await fetch(`${API_URL}/user/broker`, {
            headers: {
                'x-bridge-secret': SECRET,
                'x-user-id': '9999' // Testing with a dummy ID 
            }
        });

        console.log(`GET /api/user/broker Status: ${response.status}`);
        if (response.status === 200 || response.status === 404) {
            console.log("✅ Auth Successful (404 is okay if user has no broker)");
        } else if (response.status === 401 || response.status === 403) {
            console.log("❌ Auth Failed: Unauthorized");
        } else {
            console.log("⚠️ Unexpected Status:", response.status);
        }

    } catch (error: any) {
        console.error("Connection Error:", error.message);
    }
}

testAuth();
