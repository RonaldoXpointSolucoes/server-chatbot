async function run() {
  const url = "https://yzbxsxabzncdzuxvlppt.supabase.co/storage/v1/object/public/chat_media/tenant_8b1e427b-2321-4ea7-9d7e-90f7d5cbad21/instance_5c78d358-d449-41c4-b396-a04ab20a39e4/840c51f9-072c-4788-9c0f-338697f74381/1776424787369_media_1776424787369";
  const req = await fetch(url);
  console.log("Status:", req.status);
  console.log("Content-Type:", req.headers.get("content-type"));
  const text = await req.text();
  console.log("Body start:", text.substring(0, 100));
}
run();
