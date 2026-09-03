# Loki + Grafana Logging Stack - Deployment Guide

## Overview

This guide walks you through setting up a complete logging infrastructure for your NestJS application on your Hostinger VPS.

### Architecture

```
NestJS App (PM2)
    ↓ writes JSON logs to stdout/stderr
PM2 Log Files (/root/.pm2/logs/*.log)
    ↓ tailed by
Promtail (Docker)
    ↓ ships logs to
Loki (Docker)
    ↓ queried by
Grafana (Docker)
```

### Why This Stack?

- **Pino**: Fast structured JSON logging in your app (✅ already configured)
- **PM2**: Manages your app and rotates log files automatically (✅ already running)
- **Promtail**: Lightweight log shipper, reads PM2 logs and sends to Loki
- **Loki**: Efficient log storage and indexing (like Prometheus for logs)
- **Grafana**: Beautiful dashboards and powerful alerting

### Resource Usage

- **Loki**: ~200-300 MB RAM
- **Promtail**: ~50-100 MB RAM
- **Grafana**: ~150-200 MB RAM
- **Total**: ~400-600 MB RAM (fits in your 1GB budget)
- **Disk**: ~10-50 MB/day for logs (with 90-day retention = 1-5 GB total)

---

## Prerequisites

1. Docker and Docker Compose installed on VPS
2. Your NestJS app running under PM2
3. SSH access to your Hostinger VPS

---

## Step 1: Install Docker (if not already installed)

SSH into your VPS:

```bash
ssh root@your-vps-ip
```

Install Docker:

```bash
# Update package list
apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Verify installation
docker --version
docker-compose --version
```

---

## Step 2: Deploy Updated NestJS Code

First, you need to deploy the updated Pino configuration (JSON logs instead of pretty logs).

On your local machine, commit and push the changes:

```bash
git add src/app.module.ts
git commit -m "Configure Pino for JSON logging"
git push origin main
```

On your VPS, pull the changes:

```bash
cd /path/to/your/app  # Navigate to your app directory
git pull origin main
npm install  # Install any new dependencies if needed
pm2 restart all  # Restart your app
```

Verify JSON logs are working:

```bash
pm2 logs --lines 5 --json
```

You should see JSON-formatted logs like:
```json
{"level":30,"time":1705312200000,"msg":"Incoming request","req":{"method":"POST"}}
```

---

## Step 3: Set Up Logging Stack Directory

On your VPS, create a directory for the logging stack:

```bash
mkdir -p ~/logging-stack
cd ~/logging-stack
```

---

## Step 4: Create Configuration Files

You need to create 4 files in the `~/logging-stack` directory.

### File 1: docker-compose.yml

```bash
nano docker-compose.yml
```

Paste this content (copy from your local `logging-stack/docker-compose.yml`):

```yaml
version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.3
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
    networks:
      - logging

  promtail:
    image: grafana/promtail:2.9.3
    container_name: promtail
    volumes:
      - ./promtail-config.yml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
      - /root/.pm2/logs:/var/log/pm2:ro
    command: -config.file=/etc/promtail/config.yml
    restart: unless-stopped
    networks:
      - logging
    depends_on:
      - loki

  grafana:
    image: grafana/grafana:10.2.3
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
    restart: unless-stopped
    networks:
      - logging
    depends_on:
      - loki

volumes:
  loki-data:
    driver: local
  grafana-data:
    driver: local

networks:
  logging:
    driver: bridge
```

Save and exit (Ctrl+X, Y, Enter).

### File 2: loki-config.yml

```bash
nano loki-config.yml
```

Paste this content (copy from your local `logging-stack/loki-config.yml`):

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v12
      index:
        prefix: index_
        period: 24h

storage_config:
  tsdb_shipper:
    active_index_directory: /loki/tsdb-index
    cache_location: /loki/tsdb-cache
  filesystem:
    directory: /loki/chunks

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150

limits_config:
  retention_period: 2160h  # 90 days
  reject_old_samples: true
  reject_old_samples_max_age: 168h  # 1 week
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
  per_stream_rate_limit: 5MB
  per_stream_rate_limit_burst: 15MB
  max_query_series: 500
  max_query_parallelism: 32

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: true
  retention_period: 2160h  # 90 days

ruler:
  alertmanager_url: http://localhost:9093
```

Save and exit.

### File 3: promtail-config.yml

```bash
nano promtail-config.yml
```

**IMPORTANT**: Before pasting, you need to find your actual PM2 app name.

Run this command:
```bash
pm2 list
```

Look for your app name in the output. It might be something like `matchmadeinjannah-auth`, `auth`, or `app`.

Now paste this content, **replacing `<YOUR-APP-NAME>` with your actual PM2 app name**:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # PM2 application logs (JSON format from Pino)
  - job_name: nestjs-app
    static_configs:
      - targets:
          - localhost
        labels:
          job: nestjs-matchmadeinjannah
          app: auth-service
          __path__: /var/log/pm2/<YOUR-APP-NAME>-out.log
    pipeline_stages:
      # Parse JSON logs from Pino
      - json:
          expressions:
            level: level
            time: time
            msg: msg
            req: req
            res: res
            err: err
            userId: userId
            email: email
      # Map Pino log levels to labels
      - labels:
          level:
      # Add timestamp from Pino
      - timestamp:
          source: time
          format: Unix
      # Output the message
      - output:
          source: msg

  # PM2 error logs
  - job_name: nestjs-app-errors
    static_configs:
      - targets:
          - localhost
        labels:
          job: nestjs-matchmadeinjannah
          app: auth-service
          stream: stderr
          __path__: /var/log/pm2/<YOUR-APP-NAME>-error.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            time: time
            msg: msg
            err: err
      - labels:
          level:
      - timestamp:
          source: time
          format: Unix
      - output:
          source: msg
```

Save and exit.

### File 4: grafana-datasources.yml

```bash
nano grafana-datasources.yml
```

Paste this content:

```yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: true
    editable: true
    jsonData:
      maxLines: 1000
```

Save and exit.

---

## Step 5: Verify File Structure

Your `~/logging-stack` directory should now contain:

```bash
ls -la
```

Expected output:
```
docker-compose.yml
loki-config.yml
promtail-config.yml
grafana-datasources.yml
```

---

## Step 6: Start the Logging Stack

From the `~/logging-stack` directory:

```bash
docker-compose up -d
```

This will:
1. Pull Docker images (first time only, takes 2-3 minutes)
2. Start Loki, Promtail, and Grafana containers
3. Set up volumes for persistent storage

Verify containers are running:

```bash
docker-compose ps
```

Expected output:
```
NAME                IMAGE                         STATUS
loki                grafana/loki:2.9.3            Up
promtail            grafana/promtail:2.9.3        Up
grafana             grafana/grafana:10.2.3        Up
```

Check container logs:

```bash
# Check Loki
docker-compose logs loki

# Check Promtail
docker-compose logs promtail

# Check Grafana
docker-compose logs grafana
```

---

## Step 7: Access Grafana

Open your browser and navigate to:

```
http://your-vps-ip:3000
```

Login credentials:
- **Username**: `admin`
- **Password**: `admin`

You'll be prompted to change the password. Do this now.

---

## Step 8: Verify Logs Are Flowing

In Grafana:

1. Click **Explore** (compass icon in left sidebar)
2. Select **Loki** as the datasource (should be selected by default)
3. In the query builder, you'll see label filters
4. Click **Log browser** button
5. You should see labels like:
   - `job="nestjs-matchmadeinjannah"`
   - `level="30"` (info), `level="40"` (warn), `level="50"` (error)
6. Click any label to query logs
7. Click **Run query** button (top right)

You should see your application logs appear.

### Example Queries

```logql
# All logs from your app
{job="nestjs-matchmadeinjannah"}

# Only error logs
{job="nestjs-matchmadeinjannah"} | json | level="50"

# Only warn and error logs
{job="nestjs-matchmadeinjannah"} | json | level >= 40

# Logs containing "error" in message
{job="nestjs-matchmadeinjannah"} |= "error"

# HTTP requests
{job="nestjs-matchmadeinjannah"} | json | req_method != ""

# Logs for specific user
{job="nestjs-matchmadeinjannah"} | json | userId="some-user-id"
```

---

## Step 9: Create a Dashboard

1. In Grafana, click **Dashboards** (left sidebar)
2. Click **New** → **New Dashboard**
3. Click **Add visualization**
4. Select **Loki** datasource
5. Choose **Logs** visualization type
6. In the query editor, enter:
   ```logql
   {job="nestjs-matchmadeinjannah"} | json
   ```
7. Click **Run queries**
8. Customize the panel:
   - Title: "Application Logs"
   - Add filters, time ranges, etc.
9. Click **Save** (top right)

### Recommended Dashboard Panels

Create separate panels for:

1. **Error Rate Over Time** (Time series graph):
   ```logql
   rate({job="nestjs-matchmadeinjannah"} | json | level="50" [5m])
   ```

2. **HTTP Request Rate**:
   ```logql
   rate({job="nestjs-matchmadeinjannah"} | json | req_method != "" [1m])
   ```

3. **Recent Errors** (Logs panel):
   ```logql
   {job="nestjs-matchmadeinjannah"} | json | level >= 40
   ```

4. **Top Users by Activity**:
   ```logql
   topk(10, count_over_time({job="nestjs-matchmadeinjannah"} | json | userId != "" [1h]) by (userId))
   ```

---

## Step 10: Set Up Alerts (For Future Notifications)

In Grafana:

1. Click **Alerting** (bell icon in left sidebar)
2. Click **Alert rules** → **New alert rule**
3. Configure:
   - **Name**: "High Error Rate"
   - **Query**:
     ```logql
     rate({job="nestjs-matchmadeinjannah"} | json | level="50" [5m])
     ```
   - **Condition**: `> 0.1` (more than 0.1 errors/second)
   - **Evaluation**: Every 1 minute

4. For notifications (Slack, Discord, Telegram, WhatsApp):
   - Click **Contact points** → **New contact point**
   - Choose integration type
   - Configure webhook URL (you'll need to create these in each platform)

### Webhook Examples

**Slack**:
1. Create incoming webhook in Slack workspace
2. Add webhook URL to Grafana contact point
3. Test notification

**Discord**:
1. Create webhook in Discord server settings
2. Add webhook URL to Grafana
3. Test notification

**Telegram**:
1. Create a bot via @BotFather
2. Get bot token and chat ID
3. Use Grafana's Telegram integration

(We can set these up in detail when you're ready)

---

## Maintenance & Operations

### View Container Logs

```bash
cd ~/logging-stack

# All services
docker-compose logs -f

# Specific service
docker-compose logs -f loki
docker-compose logs -f promtail
docker-compose logs -f grafana
```

### Restart Services

```bash
cd ~/logging-stack

# Restart all
docker-compose restart

# Restart specific service
docker-compose restart loki
```

### Stop Services

```bash
cd ~/logging-stack
docker-compose down
```

### Start Services

```bash
cd ~/logging-stack
docker-compose up -d
```

### Check Disk Usage

```bash
# Check Loki data size
du -sh ~/logging-stack/loki-data

# Check Docker volumes
docker system df -v
```

### Clean Up Old Data (if needed)

Loki automatically deletes logs older than 90 days (configured in `loki-config.yml`).

To manually clean up:

```bash
cd ~/logging-stack
docker-compose down
rm -rf loki-data/*
docker-compose up -d
```

---

## Troubleshooting

### No logs appearing in Grafana

1. **Check Promtail is reading logs**:
   ```bash
   docker-compose logs promtail | grep "level=info"
   ```
   Look for messages like "started tailing file"

2. **Check PM2 log file path**:
   ```bash
   ls -la /root/.pm2/logs/
   ```
   Verify the filenames match what's in `promtail-config.yml`

3. **Check Promtail can access PM2 logs**:
   ```bash
   docker exec -it promtail ls -la /var/log/pm2/
   ```

4. **Check Loki is receiving logs**:
   ```bash
   curl -s http://localhost:3100/loki/api/v1/label/job/values
   ```
   Should return: `["nestjs-matchmadeinjannah"]`

### Grafana not accessible

1. **Check container is running**:
   ```bash
   docker-compose ps grafana
   ```

2. **Check port is open**:
   ```bash
   netstat -tuln | grep 3000
   ```

3. **Check firewall** (if enabled):
   ```bash
   ufw allow 3000
   ```

### High memory usage

1. **Check container memory**:
   ```bash
   docker stats
   ```

2. **Reduce Loki cache** (edit `loki-config.yml`):
   ```yaml
   query_range:
     results_cache:
       cache:
         embedded_cache:
           max_size_mb: 50  # Reduce from 100
   ```

3. **Restart Loki**:
   ```bash
   docker-compose restart loki
   ```

---

## Security Recommendations

1. **Change Grafana admin password** (already prompted on first login)

2. **Use firewall to restrict access**:
   ```bash
   # Only allow from specific IP
   ufw allow from YOUR_IP to any port 3000

   # Or use SSH tunnel instead
   ssh -L 3000:localhost:3000 root@your-vps-ip
   # Then access Grafana at http://localhost:3000
   ```

3. **Enable HTTPS** (future step):
   - Use nginx reverse proxy
   - Add Let's Encrypt SSL certificate

---

## Next Steps

1. ✅ Deploy the logging stack (you just did this!)
2. Create useful dashboards for your specific use cases
3. Set up alerts for critical errors
4. Configure notification channels (Slack, Discord, etc.)
5. (Optional) Set up HTTPS access via nginx
6. (Optional) Add authentication/authorization for Grafana

---

## Quick Reference

### Important URLs
- Grafana: `http://your-vps-ip:3000`
- Loki API: `http://your-vps-ip:3100`
- Promtail metrics: `http://your-vps-ip:9080/metrics`

### Important Commands
```bash
# View app logs via PM2
pm2 logs

# Check logging stack status
cd ~/logging-stack && docker-compose ps

# View Promtail logs
docker-compose logs promtail

# Restart everything
docker-compose restart

# Update configs (after editing yml files)
docker-compose down && docker-compose up -d
```

### Log Levels (Pino → Grafana)
- `level="10"` → trace
- `level="20"` → debug
- `level="30"` → info
- `level="40"` → warn
- `level="50"` → error
- `level="60"` → fatal

---

## Support

If you encounter issues:

1. Check container logs: `docker-compose logs -f`
2. Verify PM2 logs: `pm2 logs`
3. Check Promtail is tailing: `docker-compose logs promtail | grep "tailing"`
4. Verify Loki is receiving: `curl http://localhost:3100/ready`

---

That's it! You now have a complete logging infrastructure. Your logs are being collected, stored (with 90-day retention), and are queryable in Grafana.
