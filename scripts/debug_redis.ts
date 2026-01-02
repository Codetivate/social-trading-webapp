import Redis from 'ioredis';

const hosts = [
    {
        name: "New Credentials",
        url: "redis://default:A4v037zuxm6c8jbb6qpmai54kjjcbf4tu3ipaalewnzi9ash9u6@redis-18206.c252.ap-southeast-1-1.ec2.cloud.redislabs.com:18206"
    },
    {
        name: "Old Credentials",
        url: "redis://default:n5DItBZor7mogXbMJRpcNmk4uhdQhjpq@redis-18206.c252.ap-southeast-1-1.ec2.cloud.redislabs.com:18206"
    }
];

async function testConnection() {
    console.log("🔍 Testing Redis Connections...");

    for (const host of hosts) {
        console.log(`\nTesting: ${host.name}`);
        console.log(`URL: ${host.url.replace(/:[^:@]+@/, ':****@')}`); // Hide password in logs

        try {
            const redis = new Redis(host.url, {
                retryStrategy: () => null // Don't retry, just fail
            });

            await new Promise((resolve, reject) => {
                redis.once('ready', () => {
                    console.log("✅ SUCCESS: Connected and Authenticated!");
                    resolve(true);
                    redis.disconnect();
                });
                redis.once('error', (err) => {
                    console.log(`❌ FAILED: ${err.message}`);
                    resolve(false);
                    redis.disconnect();
                });
            });

        } catch (e: any) {
            console.log(`❌ ERROR: ${e.message}`);
        }
    }
}

testConnection();
