# Manual Deployment Guide (Shared Test Environment)

This directory contains the deployment setup designed for manual deployments on a shared server *without* using Docker. 

The application is run as a native Python service within a virtual environment. Since both frontend and backend are served together under a single port (e.g. `8003`), you can easily configure the host-installed Nginx as a reverse proxy.

---

## 1. Central Configuration (`.env`)

Create or edit the `.env` file in the project root to customize your ports, branding, and local configurations. The application reads these settings on startup:

```env
# ── Custom App Branding ──
# The name that will appear on the login screen, sidebar, and browser title
VITE_APP_NAME="Zenu Construction ERP"

# ── Custom Ports ──
# The port the unified FastAPI server + React frontend will listen on
BACKEND_PORT=8003

# ── General Settings ──
# Secret key used for signing JWT tokens (at least 32 characters long)
JWT_SECRET=your_32_character_jwt_secret_key
# Location where SQLite DB, uploaded files, and vector indices will live
OE_DATA_DIR="/home/kibsoft/.openestimate"
```

---

## 2. Deploying & Starting the Application

Use the provided `run.sh` script to automate dependencies setup, database initialization, and launching the server:

```bash
# Give execute permissions and run the script
chmod +x deploy/manual/run.sh
./deploy/manual/run.sh
```

This script will automatically:
1. Load configuration variables from your `.env` file.
2. Install `python3.12` and `python3.12-venv` if they are missing from the system.
3. Create a python virtual environment (`venv/`) inside the `deploy/manual/` directory.
4. Upgrade pip and install the latest `openconstructionerp[all]` package.
5. Initialize the database and directories inside the configured `OE_DATA_DIR`.
6. Start the server on `127.0.0.1:$BACKEND_PORT` serving both frontend and backend.

---

## 3. Running as a Persistent Systemd Service

To keep the application running persistently in the background after you log out of the server, configure it as a `systemd` service.

1. Create a new service file at `/etc/systemd/system/zenu-erp.service`:

```ini
[Unit]
Description=Zenu Construction ERP Service
After=network.target

[Service]
Type=simple
User=kibsoft
WorkingDirectory=/home/kibsoft/Documents/projects/construction/OpenConstructionERP
EnvironmentFile=/home/kibsoft/Documents/projects/construction/OpenConstructionERP/.env
ExecStart=/home/kibsoft/Documents/projects/construction/OpenConstructionERP/deploy/manual/venv/bin/openconstructionerp serve --host 127.0.0.1 --port 8003 --data-dir /home/kibsoft/.openestimate
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

2. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable zenu-erp.service
sudo systemctl start zenu-erp.service
```

3. Check status or view logs:
```bash
sudo systemctl status zenu-erp.service
journalctl -u zenu-erp.service -n 50 -f
```

---

## 4. Host Nginx Configuration

Since your test environment is shared, you can route domain traffic using the Nginx reverse proxy installed on the server.

Create or update your server's Nginx configuration (e.g. `/etc/nginx/sites-available/zenu-erp`):

```nginx
server {
    listen 80;
    server_name erp.zenuhcomp.com; # Replace with your test environment domain

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "same-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    # Unified Frontend & Backend Proxy
    location / {
        proxy_pass http://127.0.0.1:8003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE/Streaming Support for AI assistant chat
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/zenu-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
