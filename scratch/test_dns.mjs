import dns from 'dns';

const hosts = [
    'yzbxsxabzncdzuxvlppt.supabase.co',
    'db.yzbxsxabzncdzuxvlppt.supabase.co',
    'aws-0-sa-east-1.pooler.supabase.com'
];

for (const host of hosts) {
    dns.lookup(host, (err, address, family) => {
        console.log(`${host}: err=${err ? err.message : 'null'}, address=${address}`);
    });
}
