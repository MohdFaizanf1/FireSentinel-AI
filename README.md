# 🔥 FireShield AI — Fullstack Fire Detection System

Real-time fire detection SaaS with YOLOv8, WebSockets, Google OAuth, and a dark futuristic dashboard.

## Architecture

```
FireShield-AI/
├── frontend/          React + Vite + Tailwind + Framer Motion
├── backend/           Node.js + Express + Socket.io
│   └── fire.py        Python YOLOv8 detection (spawned as child process)
└── README.md
```

## Quick Start (Local)

### 1. Backend Setup
```bash
cd backend
cp .env.example .env    # fill in your values
npm install
# Install Python deps too:
pip install ultralytics opencv-python cvzone playsound
node server.js
```

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env    # fill in your values
npm install
npm run dev
```

### 3. Python fire.py
The backend auto-spawns `fire.py` when detection starts via `/api/start-detection`.
Make sure `fire.pt` (your YOLO model) is at `backend/models/fire.pt`.

---

## Environment Variables

### backend/.env
```
PORT=4000
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_super_secret_jwt_key
SESSION_SECRET=your_session_secret
PYTHON_PATH=python3          # or full path to your venv python
MODEL_PATH=models/fire.pt
```

### frontend/.env
```
VITE_BACKEND_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

---

## Google OAuth Setup
1. Go to https://console.cloud.google.com
2. Create a project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID (Web Application)
4. Authorized redirect URIs: `http://localhost:4000/auth/google/callback`
5. Copy Client ID & Secret into backend `.env`

---

## Deployment

### Frontend → Vercel
```bash
cd frontend
npm run build
# Push to GitHub → import in vercel.com
# Set env vars in Vercel dashboard
```
`vercel.json` is already included.

### Backend → Render
1. Create new Web Service on render.com
2. Connect GitHub repo, set root to `backend/`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add all env vars in Render dashboard

---

## Features
- 🔐 Google OAuth — protected dashboard
- ⚡ Real-time WebSockets (Socket.io)
- 🎥 Webcam fire detection (YOLOv8 via Python)
- 📊 Live charts (Recharts)
- 🔊 Alarm sound on detection
- 🗺️ Mock map view
- 📱 Mobile responsive
- 📥 CSV log export
- 🖼️ Screenshot gallery
- 🧠 AI Insights panel
