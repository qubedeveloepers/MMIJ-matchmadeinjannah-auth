# Title

Implement Centralized Logging Infrastructure with Alerting Support

# Description

## Overview

Set up a production-grade logging infrastructure for the application using self-hosted, open-source tools. This will replace the current scattered logging approach (console.log, NestJS Logger, custom MongoDB logs) with a centralized, queryable, and alertable system.

## Current State

- Mixed logging: NestJS Logger, console.log/error, and custom MongoDB LoggingService
- No log aggregation or centralized search
- No alerting or notification system for errors
- Difficult to debug production issues

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NestJS Application                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Pino Logger (structured JSON)            │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────┘
                           │ JSON logs to file/stdout
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Promtail                            │
│              (Log shipper / collector)                   │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Grafana Loki                          │
│              (Log aggregation & storage)                 │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                       Grafana                            │
│         (Visualization, Dashboards, Alerting)           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Notification Channels                       │
│      Slack | Discord | Telegram | WhatsApp | Email      │
└─────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | License |
|-----------|---------|---------|
| **Pino** | Fast, structured JSON logging for NestJS | MIT |
| **Grafana Loki** | Log aggregation and querying | Apache 2.0 |
| **Promtail** | Ships logs from app to Loki | Apache 2.0 |
| **Grafana** | Dashboards, search, and alerting | AGPL v3 |

### Estimated Resource Requirements

| Service | RAM | Disk |
|---------|-----|------|
| Loki | ~256-512MB | ~5GB (configurable retention) |
| Grafana | ~128-256MB | ~500MB |
| Promtail | ~50-100MB | Minimal |
| **Total** | **~500MB-1GB** | **~6GB** |

## Implementation Tasks

- [ ] **Application Logging**
  - [ ] Install and configure Pino with nestjs-pino
  - [ ] Create structured log format with correlation IDs
  - [ ] Replace all console.log/error calls with Pino logger
  - [ ] Standardize log levels (error, warn, info, debug)
  - [ ] Add request/response logging middleware
  - [ ] Include context in logs (userId, requestId, endpoint)

- [ ] **Infrastructure Setup**
  - [ ] Create Docker Compose file for Loki + Grafana + Promtail
  - [ ] Configure Promtail to collect application logs
  - [ ] Set up Loki data retention policy
  - [ ] Configure Grafana datasource for Loki

- [ ] **Dashboards & Visualization**
  - [ ] Create main application logs dashboard
  - [ ] Add error rate visualization
  - [ ] Add request latency panels
  - [ ] Create authentication events dashboard
  - [ ] Create media operations dashboard

- [ ] **Alerting & Notifications**
  - [ ] Configure Grafana alerting rules for critical errors
  - [ ] Set up Slack/Discord notification channel
  - [ ] Set up Telegram notification channel
  - [ ] Create alert for high error rates
  - [ ] Create alert for authentication failures spike
  - [ ] Create alert for service downtime

- [ ] **Documentation**
  - [ ] Document logging standards and best practices
  - [ ] Document how to query logs in Grafana
  - [ ] Document how to add new alert rules
  - [ ] Document deployment/maintenance procedures

## Log Levels Convention

| Level | Use Case |
|-------|----------|
| `error` | Exceptions, failed operations, requires attention |
| `warn` | Recoverable issues, deprecated usage, unusual behavior |
| `info` | Significant events (user login, payment, etc.) |
| `debug` | Detailed diagnostic info (dev/troubleshooting only) |

## Example Structured Log Format

```json
{
  "level": "error",
  "time": "2024-01-15T10:30:00.000Z",
  "requestId": "abc-123",
  "userId": "user_456",
  "context": "AuthService",
  "message": "Failed to verify OTP code",
  "errorCode": "mmij-08",
  "metadata": {
    "email": "user@example.com",
    "attemptCount": 3
  },
  "stack": "Error: Invalid code..."
}
```

## Benefits

- **Centralized logging**: All logs in one searchable place
- **Cost**: Completely free (self-hosted open-source stack)
- **Queryable**: LogQL queries for complex searches
- **Alerting**: Real-time notifications on errors
- **Dashboards**: Visual insights into application health
- **Retention**: Configurable log retention policies
- **Scalable**: Can grow with application needs

## Future Enhancements

- Add distributed tracing with Tempo
- Add metrics collection with Prometheus
- Implement log-based anomaly detection
- Add custom business metrics dashboards

## References

- [Pino Logger](https://github.com/pinojs/pino)
- [nestjs-pino](https://github.com/iamolegga/nestjs-pino)
- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)
