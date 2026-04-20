async function run() {
  const url = "https://yzbxsxabzncdzuxvlppt.supabase.co/storage/v1/object/public/chat_media/invalid_path/file.ogg";
  const req = await fetch(url);
  console.log("Status:", req.status);
  console.log("Content-Type:", req.headers.get("content-type"));
  const text = await req.text();
  console.log("Body snippet:", text.substring(0, 100));
}
run();
