When You Move to Linux

Run these 3 commands after cloning:



bash





npm install                         # restore node\_modules

npx playwright install chromium     # install browser binaries

cp .env.example .env.local          # set your Ollama config

npm run dev                         # start at localhost:3000

