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

echo "Opening preview..."

URL="http://localhost:5173/"

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="$URL"
else
    open "$URL"
fi
