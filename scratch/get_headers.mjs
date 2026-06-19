async function run() {
    const response = await fetch('https://yzbxsxabzncdzuxvlppt.supabase.co');
    console.log('Status:', response.status);
    console.log('Headers:');
    for (const [key, value] of response.headers.entries()) {
        console.log(`${key}: ${value}`);
    }
}
run();
