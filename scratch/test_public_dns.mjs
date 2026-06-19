import dns from 'dns';

// Set DNS servers to Google
dns.setServers(['8.8.8.8', '1.1.1.1']);

dns.resolve6('db.yzbxsxabzncdzuxvlppt.supabase.co', (err, addresses) => {
    console.log('IPv6 (AAAA) addresses:', { err: err ? err.message : null, addresses });
});

dns.resolve4('db.yzbxsxabzncdzuxvlppt.supabase.co', (err, addresses) => {
    console.log('IPv4 (A) addresses:', { err: err ? err.message : null, addresses });
});
