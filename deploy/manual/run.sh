#!/bin/bash
# Exit on error
set -e

# Resolve paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load configuration from root .env if it exists
if [ -f "$ROOT_DIR/.env" ]; then
    echo "Loading configuration from root .env..."
    set -a
    . "$ROOT_DIR/.env"
    set +a
elif [ -f "$SCRIPT_DIR/.env" ]; then
    echo "Loading configuration from local .env..."
    set -a
    . "$SCRIPT_DIR/.env"
    set +a
fi

# Fallback defaults
PORT=${BACKEND_PORT:-8003}
APP_NAME=${VITE_APP_NAME:-"Zenu Construction ERP"}
DATA_DIR=${OE_DATA_DIR:-"$HOME/.openestimate"}

# Set environment variables for the process
export VITE_APP_NAME="$APP_NAME"
export OE_CLI_DATA_DIR="$DATA_DIR"

echo "============================================="
echo "Starting OpenConstructionERP (No-Docker Mode)"
echo "App Name:  $VITE_APP_NAME"
echo "Port:      $PORT"
echo "Data Dir:  $DATA_DIR"
echo "============================================="

# Install system dependencies if missing
if ! command -v python3.12 &> /dev/null || ! command -v virtualenv &> /dev/null; then
    echo "System dependencies (Python 3.12 or virtualenv) not found. Installing..."
    sudo apt update && sudo apt install -y python3.12 python3-virtualenv
fi

# Set up Virtual Environment
cd "$SCRIPT_DIR"
if [ ! -d "venv" ] || [ ! -f "venv/bin/activate" ]; then
    echo "Creating virtual environment in $SCRIPT_DIR/venv..."
    rm -rf venv
    virtualenv venv
fi

source venv/bin/activate

# Upgrade pip and install package
echo "Upgrading pip and installing openconstructionerp..."
pip install --upgrade pip

# We temporarily install openconstructionerp from PyPI to obtain the pre-built
# frontend assets (_frontend_dist), then we copy them to our local backend and
# install our local codebase in editable mode so custom modifications run.
if [ ! -d "$ROOT_DIR/backend/app/_frontend_dist" ]; then
    echo "Fetching pre-built frontend assets from PyPI package..."
    pip install openconstructionerp
    SITE_PACKAGES=$(python -c "import site; print(site.getsitepackages()[0])")
    if [ -d "$SITE_PACKAGES/app/_frontend_dist" ]; then
        cp -r "$SITE_PACKAGES/app/_frontend_dist" "$ROOT_DIR/backend/app/"
    fi
fi

echo "Installing local codebase in editable mode..."
pip install -e "$ROOT_DIR/backend"

# Initialize database
echo "Initializing database..."
openconstructionerp init-db --data-dir "$DATA_DIR"

# Launch serve
echo "Launching server..."
openconstructionerp serve --host 127.0.0.1 --port "$PORT" --data-dir "$DATA_DIR"
