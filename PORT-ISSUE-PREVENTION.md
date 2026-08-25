# Port Issue Prevention Guide

## Problem
When the backend or frontend server crashes or is force-killed, the port can remain in a `TIME_WAIT` state, causing an `EADDRINUSE` error on the next startup.

## Solution: Use the Restart Script

### Option 1: PowerShell (Windows)
```powershell
# Navigate to project root
cd "c:\Users\Altius-Admin\Desktop\Nxt MarketWiz"

# Run the restart script
.\restart-servers.ps1
```

This script will:
1. ✅ Kill any existing process on port 5000 (backend)
2. ✅ Kill any existing process on port 3000 (frontend)
3. ✅ Start the backend server
4. ✅ Wait 3 seconds
5. ✅ Start the frontend server

### Option 2: Bash/WSL/Git Bash
```bash
cd "c:\Users\Altius-Admin\Desktop\Nxt MarketWiz"
bash restart-servers.sh
```

## Quick Manual Fix (If Needed)

### Windows PowerShell
```powershell
# Kill process on port 5000
Get-NetTcpConnection -LocalPort 5000 | Stop-Process -Force

# Kill process on port 3000
Get-NetTcpConnection -LocalPort 3000 | Stop-Process -Force

# Then restart your servers normally
```

### Linux/WSL/Git Bash
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Then restart your servers normally
```

## Best Practices

1. **Always use the restart script** before starting servers
2. **Let servers shut down gracefully** - press Ctrl+C in the terminal, don't force-kill
3. **If a server crashes** - run the restart script to clean up the port
4. **If you see EADDRINUSE error** - port is stuck; use the restart script immediately

## Server Improvements Made

The backend server now:
- ✅ Handles `EADDRINUSE` error gracefully with helpful messages
- ✅ Properly shuts down on `SIGTERM` and `SIGINT` signals
- ✅ Logs clear error messages if port is in use
- ✅ Allows graceful cleanup of database connections on shutdown

## Files Created

- `restart-servers.ps1` - PowerShell version (Windows)
- `restart-servers.sh` - Bash version (Linux/WSL/Git Bash)
- `server/src/index.js` - Updated with better error handling

## Going Forward

**Always use one of these approaches:**

1. **Normal workflow:** Use `restart-servers.ps1` or `restart-servers.sh`
2. **Development:** Run servers in separate terminal tabs, use Ctrl+C to stop gracefully
3. **If servers crash:** Run restart script immediately

This prevents the `EADDRINUSE` error from happening again. 🎯
