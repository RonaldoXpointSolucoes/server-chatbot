import dns from 'dns';
import pg from 'pg';
const { Client } = pg;

const regions = [
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1'
];

async function checkRegion(region) {
    const poolerHost = `aws-0-${region}.pooler.supabase.com`;
    return new Promise((resolve) => {
        dns.lookup(poolerHost, async (err, address) => {
            if (err) {
                resolve({ region, resolved: false });
                return;
            }
            
            const client = new Client({
                host: poolerHost,
                port: 6543,
                database: 'postgres',
                user: 'postgres.yzbxsxabzncdzuxvlppt',
                password: 'Xx@gh03360102',
                ssl: { rejectUnauthorized: false }
            });
            try {
                await client.connect();
                await client.end();
                resolve({ region, resolved: true, connected: true, address });
            } catch (connErr) {
                resolve({ region, resolved: true, connected: false, error: connErr.message, address });
            }
        });
    });
}

async function run() {
    console.log('Testing all 16 regions...');
    for (const r of regions) {
        const res = await checkRegion(r);
        if (res.connected) {
            console.log(`SUCCESS: Connected to region ${r}!`);
        } else if (res.resolved) {
            console.log(`Resolved ${r} but connect failed: ${res.error}`);
        } else {
            console.log(`Region ${r} could not resolve DNS.`);
        }
    }
}
run();
