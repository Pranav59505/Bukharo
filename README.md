# 🃏 Bukharo — Real-Time Multiplayer Card Game

A fully-featured implementation of the Bukharo card game, playable in real-time by 4–8 players across any device.

## Features
- Real-time multiplayer via WebSockets
- Shareable room links
- Responsive (mobile + desktop)
- Chat between players
- Full rules enforcement (sequences, pure/impure, PUT eligibility, joker movement)
- No accounts, no ads, completely free

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## 🚀 Deploy for Free (Render.com — Recommended)

1. Push this folder to a **GitHub repository**
2. Go to [render.com](https://render.com) and sign up free
3. Click **"New → Web Service"**
4. Connect your GitHub repo
5. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Click **Deploy**

Render gives you a free URL like `https://bukharo-xxxx.onrender.com`.  
Share this URL with friends — they can join from any device!

> **Note**: Free Render instances sleep after 15 min of inactivity. First load may take ~30 seconds to wake up. Upgrade to a paid plan ($7/month) to keep it always-on.

## 🚀 Alternative: Railway.app

1. Go to [railway.app](https://railway.app)
2. "New Project → Deploy from GitHub repo"
3. Select your repo — Railway auto-detects Node.js
4. Free tier includes 500 hours/month

## Game Rules Summary

**Setup**: 4–8 players (even number), teams are alternating seats (1,3,5 = Team A; 2,4,6 = Team B)

**Objective**: Form sequences of 3+ cards of the same suit (e.g., 5♦, 6♦, 7♦)

**Gameplay**:
1. Draw from closed pile OR take all open pile cards
2. Play sequences (open new or add to team's existing ones)
3. Discard one card to end turn

**Special Rules**:
- `2` is a joker (can substitute any card), max one per sequence
- A `2` of the same suit in correct position = **pure** sequence
- Must always maintain at least one pure sequence
- **PUT**: When down to last card, flip it (if team has 7-card pure or A-K sequence) and take a new 13-card bukhara group
- Game ends when a PUT is attempted with no bukharas left, or closed pile empties

**Points** (for scoring variants):
- 7-card pure sequence: 200 points
- 7-card impure sequence: 100 points  
- A-to-K pure sequence: 500 points
