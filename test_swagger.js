fetch("https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/docs-json")
  .then(r => r.json())
  .then(json => {
     let paths = Object.keys(json.paths);
     let chatPaths = paths.filter(p => p.toLowerCase().includes('profile') || p.toLowerCase().includes('contact') || p.toLowerCase().includes('picture'));
     console.log(chatPaths);
  }).catch(e => console.log(e));
