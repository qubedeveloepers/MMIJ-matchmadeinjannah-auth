## Deploying NESTJS Backend on Hostinger VPS

- Preparing the VPS Environment
- Setting Up the MongoDB Database
- Deploying the NestJS Backend

### 1. Preparing the VPS Environment

Log in to Hostinger VPS in Terminal

```bash
 ssh root@vps_ip
```

Update and Upgrade the Ubuntu System

```bash
  sudo apt update
```

```bash
  sudo apt upgrade -y
```

Install Node.js and npm ( if not pre-installed)

```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
```

```bash
  sudo apt-get install -y nodejs
```

Install Git

```bash
  sudo apt install -y git
```

### 2. Setting Up the MongoDB Database

Create a MongoDB Atlas Cluster by creating an Atlas Account on: [click here](https://www.mongodb.com/try)

### 3. Deploying the NestJS Backend

Clone The Backend Repository

```bash
 mkdir /var/www
```

```bash
 cd /var/www
```

```bash
 git clone https://github.com/MatchMadeInParadise/matchmadeinjannah-auth.git
```

```bash
 cd matchmadeinjannah-auth
```

Install Dependencies

```bash
 npm install
```

Create .env file & configure Environment Variables

```bash
 nano .env
```

add environment variables then save and exit (Ctrl + X, then Y and Enter).

Installing pm2 to Start Backend

```bash
 npm install -g pm2
```

Create build of NestJS project

```bash
 npm run build
```

Run the NestJS build using pm2

```bash
 pm2 start dist/main.js --name mmij
```

Start Backend on startup

```bash
 pm2 startup
```

```bash
 pm2 save
```

Allowing backend port in firewall

```bash
 sudo ufw status
```

If firewall is disable then enable it using

```bash
 sudo ufw enable
```

```bash
 sudo ufw allow 'OpenSSH'
```

Allow port 3000 on which backend is running

```bash
 sudo ufw allow 3000
```

Install Nginx

```bash
 sudo apt install -y nginx
```

adding Nginx in firewall

```bash
 sudo ufw status
```

```bash
 sudo ufw allow 'Nginx Full'
```

### 5. Configuring Nginx as a Reverse Proxy

Update Backend Nginx Configuration

```bash
nano /etc/nginx/sites-available/api.matchmadeinjannah.com.conf
```

```bash
server {
    listen 80;
    server_name api.matchmadeinjannah.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Create symbolic links to enable the sites.

```bash
ln -s /etc/nginx/sites-available/api.matchmadeinjannah.com.conf /etc/nginx/sites-enabled/
```

Restart nginx

```bash
systemctl restart nginx
```

### Connect Domain Name with Backend

Go to: [click here](https://hpanel.hostinger.com/websites/matchmadeinjannah.com/advanced/dns-zone-editor?redirectLocation=side_menu)

- Add a record with following credentials

| Column 1  | Column 2       |
| --------- | -------------- |
| Type      | A              |
| Name      | api            |
| Points to | VPS ip address |

### 6. Setting Up SSL Certificates

Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Obtain SSL Certificates

```bash
certbot --nginx -d api.matchmadeinjannah.com
```

Verify Auto-Renewal

```bash
certbot renew --dry-run
```

### 7. Restarting Server

To download latest code and restart pm2 server do as follows

```bash
git pull origin main
```

```bash
npm install
```

```bash
npm run build
```

```bash
pm2 restart mmij
```
