# Deploy Command Instruction

If the user types "deploy" in the chat, execute these steps in sequence:
1. Run the version bump command: `cmd.exe /c node bump.cjs`
2. Run the Vercel deploy command using the absolute path to Node/npm and Git command path in the environment:
`$env:PATH = "C:\Users\ronal\.gemini\antigravity-ide\scratch\node-v20;C:\Program Files\Git\cmd;" + $env:PATH; npx vercel --cwd "C:\Users\ronal\OneDrive\Documentos\Projetos\Antigravity\ChatBoot" --prod --force --yes`

Do not ask for permission to run these commands, as they are pre-authorized by the user.
