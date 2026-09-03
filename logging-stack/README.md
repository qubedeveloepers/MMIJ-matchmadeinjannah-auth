# Logging Stack for MatchMadeInJannah Auth Service

This directory contains the configuration for the Loki + Grafana logging infrastructure.

## What's Inside

- **docker-compose.yml** - Orchestrates Loki, Promtail, and Grafana containers
- **loki-config.yml** - Loki configuration (storage, retention, limits)
- **promtail-config.yml** - Promtail configuration (log shipping from PM2 to Loki)
- **grafana-datasources.yml** - Auto-configures Loki as Grafana datasource
- **DEPLOYMENT_GUIDE.md** - Complete step-by-step deployment instructions

## Quick Start

### Prerequisites
- Docker and Docker Compose installed on VPS
- NestJS app running under PM2
- Updated Pino configuration (JSON logs)

### Deploy

1. Copy this entire `logging-stack` directory to your VPS:
   ```bash
   scp -r logging-stack root@your-vps-ip:~/
   ```

2. SSH into your VPS:
   ```bash
   ssh root@your-vps-ip
   ```

3. Navigate to the directory:
   ```bash
   cd ~/logging-stack
   ```

4. **IMPORTANT**: Edit `promtail-config.yml` and replace `<YOUR-APP-NAME>` with your actual PM2 app name:
   ```bash
   # First, find your app name
   pm2 list

   # Then edit the file
   nano promtail-config.yml
   # Replace <YOUR-APP-NAME> with the actual name
   ```

5. Start the stack:
   ```bash
   docker-compose up -d
   ```

6. Access Grafana at `http://your-vps-ip:3000`
   - Username: `admin`
   - Password: `admin`

7. Follow **DEPLOYMENT_GUIDE.md** for detailed instructions on creating dashboards and alerts.

## Architecture

```
NestJS App → PM2 Logs → Promtail → Loki ← Grafana
```

## Resource Usage

- **RAM**: ~400-600 MB total
- **Disk**: ~10-50 MB/day (with 90-day retention)

## Common Commands

```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Start services
docker-compose up -d

# Check status
docker-compose ps
```

## Troubleshooting

See **DEPLOYMENT_GUIDE.md** section "Troubleshooting" for detailed help.

Quick checks:
```bash
# Check Promtail is reading logs
docker-compose logs promtail | grep "tailing"

# Check Loki is receiving logs
curl http://localhost:3100/loki/api/v1/label/job/values

# Verify PM2 log files exist
ls -la /root/.pm2/logs/
```

## Next Steps

1. Create dashboards in Grafana
2. Set up alerts for critical errors
3. Configure notification channels (Slack, Discord, Telegram, WhatsApp)

See **DEPLOYMENT_GUIDE.md** for complete instructions.
