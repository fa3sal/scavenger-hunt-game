// ═══════════════════════════════════════════════
// server.js  —  Run with: node server.js
// Install deps first: npm install express cors
// ═══════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs = require('fs');

// ══════════════════════════════════════════════
// API key is loaded from .env file — never
// hardcode it here. Add to .gitignore too.
// ══════════════════════════════════════════════
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// ══════════════════════════════════════════════

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Serve index.html from the public/ subfolder
app.use(express.static(path.join(__dirname, 'public')));


// ═══════════════════════════════════════════════
// ▼▼▼  EDIT YOUR ANSWERS HERE  ▼▼▼
// Keys are stage indices (0, 1, 2, ...).
// Each stage can have multiple accepted answers.
// All comparisons are case-insensitive + trimmed.
//
// ADD a stage:    add a new "2: [...]" entry
// REMOVE a stage: delete the entry
// CHANGE answer:  edit the array
// ═══════════════════════════════════════════════
const ANSWERS = {
  0: ['3a'],      // Stage 1 — Library: shelf bay
  1: ['8045'],    // Stage 2 — Lounge: printer model digits
  2: ['2232'],    // Stage 3 — Club Room: code behind poster ← CHANGE THIS
};
// ═══════════════════════════════════════════════
// ▲▲▲  END OF ANSWER CONFIG  ▲▲▲
// ═══════════════════════════════════════════════


// ── Rate limiting ────────────────────────────────
// Max 20 attempts per IP per 10 minutes
const attempts  = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 20;

function rateLimit(req, res, next) {
  const ip  = req.ip;
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count++;
  attempts.set(ip, rec);
  if (rec.count > MAX_TRIES) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  next();
}


// ── Answer check endpoint ────────────────────────
// POST /check  { stage: 0, answer: "3a" }
// Returns      { correct: true/false }
// Answers never leave this file.
app.post('/check', rateLimit, (req, res) => {
  const { stage, answer } = req.body;
  if (typeof stage !== 'number' || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const accepted = ANSWERS[stage];
  if (!accepted) return res.status(400).json({ error: 'Unknown stage.' });
  const correct = accepted.some(a => a.toLowerCase() === answer.trim().toLowerCase());
  setTimeout(() => res.json({ correct }), 300);
});


// ── Stage count endpoint ─────────────────────────
// GET /stages  → { count: 3 }
app.get('/stages', (req, res) => {
  res.json({ count: Object.keys(ANSWERS).length });
});


// ── Hint endpoint (Gemini) ───────────────────────
// POST /hint  { stage, message, stageTitle, stageLocation, hintContext }
// Returns     { reply: "hint text" }
// Gemini API key stays on server — never sent to browser.
app.post('/hint', async (req, res) => {
  const { stage, message, stageTitle, stageLocation, hintContext } = req.body;

  if (!message || typeof stage !== 'number') {
    return res.status(400).json({ reply: '// invalid request.' });
  }

  const systemPrompt =
    `You are an AI pair programmer hint assistant for a software engineering ` +
    `club scavenger hunt called "Build & Deploy". ` +
    `The player is on Task ${stage + 1}: ${stageTitle} at ${stageLocation}. ` +
    `SOLUTION CONTEXT (never reveal this directly): ${hintContext}. ` +
    `RULES: Respond like a senior developer giving a code review hint — technical, ` +
    `dry, slightly cryptic. Be helpful but don't give the answer away. ` +
    `Keep replies under 3 sentences. ` +
    `First ask: subtle nudge only. Second+ ask: progressively more direct. ` +
    `Never reveal the full answer on the very first ask.`;

const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`;

  try {
    const geminiRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': (GEMINI_API_KEY || '').trim()
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
      })
    });

    const data = await geminiRes.json();

    if (data.error) {
      console.error('Gemini error:', data.error.message);
      return res.json({ reply: '// hint error: ' + data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
                  || '// hint compilation failed. check your logic.';
    res.json({ reply });

  } catch (e) {
    console.error('Hint fetch error:', e.message);
    res.status(500).json({ reply: '// hint system offline. examine the environment.' });
  }
});


// ── Leaderboard (Saved to leaderboard.json) ──────────────────
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

function getLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading leaderboard:', e.message);
  }
  return [];
}

// GET /leaderboard → Returns top 10 fastest players
app.get('/leaderboard', (req, res) => {
  const board = getLeaderboard();
  res.json(board.slice(0, 10));
});

// POST /leaderboard → { name: "Faisal", timeSeconds: 145, formattedTime: "02:25" }
app.post('/leaderboard', (req, res) => {
  const { name, timeSeconds, formattedTime } = req.body;

  if (typeof name !== 'string' || !name.trim() || typeof timeSeconds !== 'number') {
    return res.status(400).json({ error: 'Invalid score submission.' });
  }

  const cleanName = name.trim().slice(0, 20); // Max 20 characters
  const board = getLeaderboard();

  board.push({
    name: cleanName,
    timeSeconds,
    formattedTime: formattedTime || `${timeSeconds}s`,
    date: new Date().toISOString()
  });

  // Sort fastest (lowest timeSeconds) first
  board.sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Save top 50 scores to leaderboard.json
  const topScores = board.slice(0, 50);
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(topScores, null, 2));

  res.json({ leaderboard: topScores.slice(0, 10) });
});

// ── Start ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Build & Deploy server running`);
  console.log(`  http://localhost:${PORT}\n`);
  if (!GEMINI_API_KEY) {
    console.log('  ⚠  GEMINI_API_KEY not set in .env — hint bot will not work\n');
  }
});
