#!/bin/bash
cd "$(dirname "$0")/../.."

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if dev server is already running on port 5173
if lsof -i :5173 | grep -q LISTEN; then
    echo "Dev server already running."
else
    echo "Starting dev server..."
    npm run dev > /dev/null 2>&1 &
    sleep 5
fi

echo "Opening presentation..."

URL="http://localhost:5173/presentation.html"

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="$URL"
else
    open "$URL"
fi

# Resize Chrome window to presentation size (1360 x 1392) in background
(
    for i in $(seq 1 15); do
        sleep 1
        result=$(osascript 2>/dev/null << 'EOF'
tell application "Google Chrome"
    if (count of windows) > 0 then
        set bounds of window 1 to {0, 0, 1360, 1392}
        return "ok"
    end if
    return "wait"
end tell
EOF
        )
        [ "$result" = "ok" ] && break
    done
) &
