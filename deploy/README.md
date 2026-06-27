# Sapu Split Deploy — Option 2

Two-VM deployment: **control plane** (DB + queue + API + web admin) + **worker** (puppeteer scraper). Total ~€9.50/mo on Hetzner Cloud.

## Why split

- **Worker can crash/OOM** (puppeteer is messy) without taking down the database or queue.
- **Worker can scale horizontally** — copy VM-B and add more worker VMs pointing at the same VM-A.
- **Worker can be geo-distributed** — put VM-B in a different Hetzner datacenter if SE Asian sites start blocking your VM-A IP.
- **Backup story is cleaner** — snapshot VM-A (stateful), treat VM-B as ephemeral.

## Architecture

```
┌──────────────────────────┐    ┌────────────────────────┐
│ VM-A: control plane      │    │ VM-B: worker           │
│ Hetzner CCX13 €8.50/mo   │    │ Hetzner CX22 €4.75/mo  │
│                          │    │                        │
│  nginx :80/:443 (public) │    │  puppeteer worker      │
│   ├─ web admin static    │    │   (no public ports)    │
│   └─ /api/* ──► api:3000 │    │                        │
│  api:3000                │◄───│  posts heartbeats      │
│  rabbitmq:5672           │◄───│  consumes jobs         │
│  postgres:5432           │◄───│  writes articles       │
│  pgvector                │    │                        │
│                          │    │                        │
│  private 10.0.0.1        │    │  private 10.0.0.2      │
└──────────────────────────┘    └────────────────────────┘
```

## Hetzner Cloud setup

### 1. Create a private network

```bash
# In Hetzner Cloud Console or via hcloud CLI:
hcloud network create --name sapu-net --ip-range 10.0.0.0/16
hcloud network add-subnet sapu-net --type server --network-zone eu-central --ip-range 10.0.0.0/24
```

### 2. Provision two VMs

```bash
hcloud server create --name sapu-a --type cax21 \
  --image ubuntu-24.04 --location nbg1 \
  --ssh-key <your-key> \
  --network sapu-net

hcloud server create --name sapu-b --type cax21 \
  --image ubuntu-24.04 --location nbg1 \
  --ssh-key <your-key> \
  --network sapu-net
```

(`cax21` = ARM, 2 vCPU / 4 GB / 40 GB = €3.79/mo each. For 23 sites with cron every 6h, that's plenty. Bump to `cax31` 4/8 if you want headroom or aggressive scraping.)

### 3. After both VMs are up, note the private IPs

```bash
hcloud server list -o columns=name,ipv4,private_net
```

Say VM-A = `10.0.0.1`, VM-B = `10.0.0.2`.

### 4. Open firewall only on VM-A

On VM-A only:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

On VM-B:
```bash
sudo ufw allow 22/tcp
sudo ufw enable
# No inbound for 80/443 - worker has no public ports
```

## VM-A setup (control plane)

```bash
ssh root@<vm-a-public-ip>

# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Clone repo
git clone https://github.com/ahsanatha/sapu.git /opt/sapu
cd /opt/sapu/deploy

# 3. Build web admin (one-time)
cd /opt/sapu && pnpm install && pnpm -w --filter ./web install && pnpm -w --filter ./web run build

# 4. Configure
cp env.control-plane.example .env
# Edit .env: set strong random passwords + OpenRouter API key

# 5. TLS certs (Let's Encrypt)
mkdir -p certs
# Option A: certbot standalone (requires port 80 free temporarily)
docker run --rm -v $(pwd)/certs:/etc/letsencrypt \
  -p 80:80 certbot/certbot certonly --standalone \
  -d your-domain.example --agree-tos -m you@example.com
cp certs/etc/live/your-domain/fullchain.pem certs/
cp certs/etc/live/your-domain/privkey.pem certs/
# Option B: use Hetzner cert-manager or upload your own

# 6. Start
docker compose -f control-plane.yml --env-file .env up -d
docker compose -f control-plane.yml logs -f api
```

Verify: `curl https://your-domain.example/health` → `{"status":"healthy",...}`

## VM-B setup (worker)

```bash
ssh root@<vm-b-public-ip>

# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Clone repo
git clone https://github.com/ahsanatha/sapu.git /opt/sapu
cd /opt/sapu/deploy

# 3. Copy site configs from VM-A (so worker doesn't depend on the image)
scp -r root@<vm-a-ip>:/opt/sapu/config/sites ./sites

# 4. Configure
cp env.worker.example .env
# Edit .env: set CONTROL_PLANE_HOST=10.0.0.1, paste matching DB/queue passwords

# 5. Start
docker compose -f worker.yml --env-file .env up -d
docker compose -f worker.yml logs -f worker
```

You should see:
```
🐰 Queue connected successfully
📊 Database connected
🚀 Starting Sapu Engine...
⏰ Scheduled workflow: complete_scraping_workflow (0 */6 * * *, TZ=UTC)
✅ Engine started successfully
```

## Verify the split

From VM-B:
```bash
docker compose -f worker.yml exec worker \
  sh -c 'curl -s http://10.0.0.1:3000/health'
# {"status":"healthy","timestamp":"..."}

docker compose -f worker.yml logs worker | grep -E "Connected|Started"
```

From VM-A admin UI:
```
https://your-domain.example/
```
You should see enabled_sites = 23 (or however many) and queue depths updating.

## Scaling workers

Add another worker VM:

```bash
# Provision VM-C the same way as VM-B
hcloud server create --name sapu-c --type cax21 \
  --image ubuntu-24.04 --location nbg1 \
  --ssh-key <your-key> --network sapu-net

# On VM-C, repeat the worker setup
ssh root@<vm-c-ip> ...
# Same .env, just change WORKER_ID=worker-2
```

Queue prefetch adjusts automatically via the autoscaler processor (`core/plugins/autoscaler.ts`).

## Backup strategy

### VM-A (stateful)

```bash
# Postgres dump (run on VM-A)
docker compose -f control-plane.yml exec postgres \
  pg_dump -U sapu sapu | gzip > /backup/sapu-$(date +%F).sql.gz

# Or snapshot the volume
docker run --rm -v sapu-control-plane_pgdata:/data \
  -v $(pwd)/backup:/backup alpine \
  tar czf /backup/pgdata-$(date +%F).tgz /data
```

Schedule with cron:
```bash
0 3 * * * /opt/sapu/deploy/backup.sh
```

### VM-B (ephemeral)

No backups needed. If it dies, re-provision and `docker compose up`. New articles will re-appear from VM-A's existing data on next scrape cycle.

## Cost summary

| VM | Type | Spec | Cost/mo |
|---|---|---|---|
| VM-A (sapu-a) | cax21 | 2 vCPU / 4 GB / 40 GB | €3.79 |
| VM-B (sapu-b) | cax21 | 2 vCPU / 4 GB / 40 GB | €3.79 |
| Private network | — | — | €0 (free within same zone) |
| Snapshots (VM-A only) | — | weekly, 4 retained | ~€0.50 |
| **Total** | | | **~€8/mo** |

For more headroom, bump both to `cax31` (4 vCPU / 8 GB) = €7.49/mo each, total ~€15.

## Troubleshooting

**Worker can't connect to postgres**: check `CONTROL_PLANE_HOST` in VM-B's `.env` matches VM-A's actual private IP, not public. Verify with `docker compose -f worker.yml exec worker sh -c 'nc -zv $CONTROL_PLANE_HOST 5432'`.

**API can't reach postgres**: same — check `postgres` resolves. With Docker Compose, services in the same compose file are on the same network; `postgres:5432` from inside `api` works.

**TLS cert renewal**: use `certbot renew` via cron on VM-A, or Hetzner's managed cert. The compose file expects `certs/fullchain.pem` and `certs/privkey.pem`.

**Worker OOM**: edit `deploy/worker.yml` `deploy.resources.limits.memory` from 4G to 6G, or reduce `QUEUE_PREFETCH` to 3 in `.env`.

## Files

```
deploy/
├── README.md                      # this file
├── control-plane.yml              # docker compose for VM-A
├── worker.yml                     # docker compose for VM-B
├── nginx.conf                     # nginx reverse proxy + web admin
├── env.control-plane.example      # env template for VM-A
├── env.worker.example             # env template for VM-B
└── sites/                         # populated by scp from VM-A
```
