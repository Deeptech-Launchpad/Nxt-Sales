#!/bin/bash
# NXT MarketingWiz - Server Restart Script (Bash/WSL/Git Bash)

echo "🔄 NXT MarketingWiz - Restarting Servers"
echo ""

# Kill processes on port 5000 (backend)
echo "Cleaning up port 5000..."
if lsof -ti:5000 >/dev/null 2>&1; then
  lsof -ti:5000 | xargs kill -9 2>/dev/null
  echo "✓ Port 5000 cleared"
else
  echo "✓ Port 5000 is free"
fi

# Kill processes on port 3000 (frontend)
echo "Cleaning up port 3000..."
if lsof -ti:3000 >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null
  echo "✓ Port 3000 cleared"
else
  echo "✓ Port 3000 is free"
fi

echo ""
echo "Starting backend server..."
cd "c:/Users/Altius-Admin/Desktop/Nxt MarketWiz/server"
npm run dev > /tmp/backend.log 2>&1 &
echo "✓ Backend starting on http://localhost:5000"

sleep 3

echo "Starting frontend server..."
cd "c:/Users/Altius-Admin/Desktop/Nxt MarketWiz/client"
npm run dev > /tmp/frontend.log 2>&1 &
echo "✓ Frontend starting on http://localhost:3000"

echo ""
echo "✅ Both servers are starting!"
echo "   Backend:  http://localhost:5000"
echo "   Frontend: http://localhost:3000"
echo ""
echo "Wait 5-10 seconds for servers to fully initialize..."
