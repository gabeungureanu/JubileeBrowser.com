#!/bin/bash
# =============================================================================
# Mailcow Dockerized Setup Script for Jubilee Browser
# =============================================================================
# This script sets up Mailcow with Amazon SES as a smart host relay.
# Run this on a Linux server with Docker and Docker Compose installed.
# =============================================================================

set -e

# Configuration
MAILCOW_HOSTNAME="mail.jubileebrowser.com"
MAILCOW_INSTALL_DIR="/opt/mailcow-dockerized"
TIMEZONE="America/New_York"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Jubilee Browser Mailcow Setup ===${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Installing...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Installing...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin
fi

# Check if port 25 is available
if ss -tuln | grep -q ':25 '; then
    echo -e "${YELLOW}Warning: Port 25 is already in use. Mailcow needs this port.${NC}"
fi

# Clone Mailcow
echo -e "${YELLOW}Setting up Mailcow...${NC}"

if [ -d "$MAILCOW_INSTALL_DIR" ]; then
    echo -e "${YELLOW}Mailcow directory already exists. Backing up...${NC}"
    mv "$MAILCOW_INSTALL_DIR" "${MAILCOW_INSTALL_DIR}.bak.$(date +%Y%m%d%H%M%S)"
fi

cd /opt
git clone https://github.com/mailcow/mailcow-dockerized.git
cd mailcow-dockerized

# Generate configuration
echo -e "${YELLOW}Generating Mailcow configuration...${NC}"
./generate_config.sh << EOF
$MAILCOW_HOSTNAME
$TIMEZONE
EOF

# Configure Amazon SES as smart host
echo -e "${YELLOW}Configuring Amazon SES relay...${NC}"

# Read SES credentials from environment or prompt
if [ -z "$SES_SMTP_USERNAME" ]; then
    read -p "Enter Amazon SES SMTP Username: " SES_SMTP_USERNAME
fi

if [ -z "$SES_SMTP_PASSWORD" ]; then
    read -s -p "Enter Amazon SES SMTP Password: " SES_SMTP_PASSWORD
    echo
fi

if [ -z "$SES_SMTP_ENDPOINT" ]; then
    SES_SMTP_ENDPOINT="email-smtp.us-east-1.amazonaws.com"
fi

# Configure Postfix relayhost in mailcow.conf
echo "" >> mailcow.conf
echo "# Amazon SES Smart Host Configuration" >> mailcow.conf
echo "RELAYHOST=[$SES_SMTP_ENDPOINT]:587" >> mailcow.conf
echo "RELAYHOST_USERNAME=$SES_SMTP_USERNAME" >> mailcow.conf
echo "RELAYHOST_PASSWORD=$SES_SMTP_PASSWORD" >> mailcow.conf

# Adjust memory limits for smaller servers (optional)
# Uncomment if running on a server with limited RAM
# echo "SKIP_CLAMD=y" >> mailcow.conf
# echo "SKIP_SOLR=y" >> mailcow.conf

echo -e "${GREEN}Mailcow configuration complete!${NC}"

# Create custom Postfix configuration for SES
echo -e "${YELLOW}Creating Postfix SES configuration...${NC}"

mkdir -p data/conf/postfix

cat > data/conf/postfix/extra.cf << 'POSTFIX_CONFIG'
# Amazon SES TLS configuration
smtp_tls_security_level = encrypt
smtp_sasl_auth_enable = yes
smtp_sasl_security_options = noanonymous
smtp_sasl_password_maps = texthash:/opt/postfix/conf/sasl_passwd
smtp_use_tls = yes
smtp_tls_note_starttls_offer = yes

# Connection pooling for better performance
smtp_destination_concurrency_limit = 10
default_destination_concurrency_limit = 5

# Queue settings
maximal_queue_lifetime = 3d
bounce_queue_lifetime = 3d

# Header cleanup (remove internal headers before sending)
smtp_header_checks = regexp:/opt/postfix/conf/header_cleanup
POSTFIX_CONFIG

# Create SASL password file template
cat > data/conf/postfix/sasl_passwd << SASL_CONFIG
[$SES_SMTP_ENDPOINT]:587 $SES_SMTP_USERNAME:$SES_SMTP_PASSWORD
SASL_CONFIG

# Create header cleanup rules
cat > data/conf/postfix/header_cleanup << 'HEADER_CLEANUP'
/^Received:.*\[10\./            IGNORE
/^Received:.*\[172\.(1[6-9]|2[0-9]|3[01])\./  IGNORE
/^Received:.*\[192\.168\./      IGNORE
/^X-Originating-IP:/            IGNORE
HEADER_CLEANUP

echo -e "${GREEN}Postfix SES configuration created!${NC}"

# Start Mailcow
echo -e "${YELLOW}Starting Mailcow containers...${NC}"
docker compose pull
docker compose up -d

echo -e "${GREEN}=== Mailcow Setup Complete ===${NC}"
echo ""
echo -e "Mailcow Admin URL: ${YELLOW}https://$MAILCOW_HOSTNAME${NC}"
echo -e "Default Admin: ${YELLOW}admin${NC}"
echo -e "Default Password: ${YELLOW}moohoo${NC} (CHANGE THIS IMMEDIATELY!)"
echo ""
echo -e "${YELLOW}Important next steps:${NC}"
echo "1. Configure DNS records (see dns-requirements.md)"
echo "2. Change the admin password"
echo "3. Verify domain in Amazon SES"
echo "4. Add domains and mailboxes via Mailcow admin panel"
echo "5. Configure DKIM signing in Mailcow"
echo ""
echo -e "${GREEN}Done!${NC}"
