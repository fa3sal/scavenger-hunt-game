# Build & Deploy — Setup Guide
 
## File structure
 
```
your-project/
├── server.js          ← answers live here (never sent to browser)
├── package.json
└── public/
    └── index.html     ← the game UI (safe to inspect)
```
 
---
 
## 1. Install dependencies
 
```bash
npm init -y
npm install express cors
```
 
---

# 2. Run locally
 
```bash
node server.js
```
 
Open http://localhost:3000 in your browser.
 
---

 const SERVER = 'https://scavenger-hunt-game-production.up.railway.app';