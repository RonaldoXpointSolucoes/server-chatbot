async function test() {
  const url = "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/instance/fetchInstances";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": "356c087d9-4073-4ceb-986a-09083992518c",
        "Content-Type": "application/json"
      }
    });
    console.log(res.status);
    const text = await res.text();
    console.log(text.substring(0, 100));
  } catch(e) {
     console.log(e.message);
  }
}
test();
