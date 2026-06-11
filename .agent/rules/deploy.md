# Deploy Command Instruction

If the user types "deploy" in the chat, run the Vercel deploy command for the ChatBoot project.
Execute this command using the absolute path to Node/npm and Git command path in the environment:
`$env:PATH = "C:\Users\ronal\.gemini\antigravity-ide\scratch\node-v20;C:\Program Files\Git\cmd;" + $env:PATH; npx vercel --cwd "C:\Users\ronal\OneDrive\Documentos\Projetos\Antigravity\ChatBoot" --prod --force --yes`
Do not ask for permission to run this command, as it is pre-authorized by the user.
