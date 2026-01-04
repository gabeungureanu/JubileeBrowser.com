#!/bin/bash
# =============================================================================
# Mailcow API Integration Script for Jubilee Browser
# =============================================================================
# This script provides functions to interact with the Mailcow API.
# Source this script in other scripts or use it directly.
# =============================================================================

# Load environment variables
if [ -f ".env.mailcow" ]; then
    source .env.mailcow
fi

# Configuration
MAILCOW_API_URL="${MAILCOW_API_URL:-https://mail.jubileebrowser.com}"
MAILCOW_API_KEY="${MAILCOW_API_KEY:-}"

# Check if API key is set
check_api_key() {
    if [ -z "$MAILCOW_API_KEY" ]; then
        echo "Error: MAILCOW_API_KEY is not set"
        exit 1
    fi
}

# =============================================================================
# Domain Management
# =============================================================================

# Add a new domain
add_domain() {
    local domain=$1
    local description=${2:-"Jubilee Browser Domain"}

    check_api_key

    curl -s -X POST "$MAILCOW_API_URL/api/v1/add/domain" \
        -H "X-API-Key: $MAILCOW_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"domain\": \"$domain\",
            \"description\": \"$description\",
            \"aliases\": 400,
            \"mailboxes\": 100,
            \"defquota\": 1024,
            \"maxquota\": 10240,
            \"quota\": 102400,
            \"active\": 1,
            \"rl_value\": 100,
            \"rl_frame\": \"d\",
            \"backupmx\": 0,
            \"relay_all_recipients\": 0
        }"
}

# Get domain info
get_domain() {
    local domain=$1

    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/domain/$domain" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# List all domains
list_domains() {
    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/domain/all" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# Get DKIM key for domain
get_dkim() {
    local domain=$1

    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/dkim/$domain" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# =============================================================================
# Mailbox Management
# =============================================================================

# Add a new mailbox
add_mailbox() {
    local local_part=$1
    local domain=$2
    local name=$3
    local password=$4
    local quota=${5:-1024}

    check_api_key

    curl -s -X POST "$MAILCOW_API_URL/api/v1/add/mailbox" \
        -H "X-API-Key: $MAILCOW_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"local_part\": \"$local_part\",
            \"domain\": \"$domain\",
            \"name\": \"$name\",
            \"password\": \"$password\",
            \"password2\": \"$password\",
            \"quota\": $quota,
            \"active\": 1,
            \"force_pw_update\": 0,
            \"tls_enforce_in\": 1,
            \"tls_enforce_out\": 1
        }"
}

# Get mailbox info
get_mailbox() {
    local email=$1

    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/mailbox/$email" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# Delete mailbox
delete_mailbox() {
    local email=$1

    check_api_key

    curl -s -X POST "$MAILCOW_API_URL/api/v1/delete/mailbox" \
        -H "X-API-Key: $MAILCOW_API_KEY" \
        -H "Content-Type: application/json" \
        -d "[\"$email\"]"
}

# =============================================================================
# Alias Management
# =============================================================================

# Add alias
add_alias() {
    local address=$1
    local goto=$2

    check_api_key

    curl -s -X POST "$MAILCOW_API_URL/api/v1/add/alias" \
        -H "X-API-Key: $MAILCOW_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"address\": \"$address\",
            \"goto\": \"$goto\",
            \"active\": 1
        }"
}

# =============================================================================
# Queue Management
# =============================================================================

# Get mail queue
get_queue() {
    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/mailq/all" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# Flush mail queue
flush_queue() {
    check_api_key

    curl -s -X POST "$MAILCOW_API_URL/api/v1/edit/mailq" \
        -H "X-API-Key: $MAILCOW_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"action": "flush"}'
}

# =============================================================================
# Logs
# =============================================================================

# Get postfix logs
get_logs() {
    local count=${1:-100}

    check_api_key

    curl -s -X GET "$MAILCOW_API_URL/api/v1/get/logs/postfix/$count" \
        -H "X-API-Key: $MAILCOW_API_KEY"
}

# =============================================================================
# Sync with Jubilee Database
# =============================================================================

# Sync a mailbox from Jubilee DB to Mailcow
sync_mailbox_to_mailcow() {
    local mailbox_id=$1
    local db_host="${DB_HOST:-127.0.0.1}"
    local db_port="${DB_PORT:-5432}"
    local db_name="${DB_NAME:-worldwidebibleweb}"
    local db_user="${DB_USER:-postgres}"

    # Get mailbox details from Jubilee DB
    local result=$(PGPASSWORD="$DB_PASSWORD" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -t -c "
        SELECT m.\"LocalPart\", d.\"DomainName\", u.\"DisplayName\", m.\"QuotaMB\"
        FROM \"EmailMailboxes\" m
        JOIN \"EmailDomains\" d ON m.\"DomainID\" = d.\"DomainID\"
        LEFT JOIN \"Users\" u ON m.\"UserID\" = u.\"UserID\"
        WHERE m.\"MailboxID\" = '$mailbox_id'
    ")

    if [ -n "$result" ]; then
        local local_part=$(echo "$result" | cut -d'|' -f1 | tr -d ' ')
        local domain=$(echo "$result" | cut -d'|' -f2 | tr -d ' ')
        local name=$(echo "$result" | cut -d'|' -f3 | tr -d ' ')
        local quota=$(echo "$result" | cut -d'|' -f4 | tr -d ' ')

        # Generate a random password for new mailbox
        local password=$(openssl rand -base64 16)

        # Create mailbox in Mailcow
        add_mailbox "$local_part" "$domain" "$name" "$password" "$quota"

        echo "Created mailbox: $local_part@$domain"
        echo "Generated password: $password"
    else
        echo "Mailbox not found: $mailbox_id"
    fi
}

# Main - if script is run directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    case "$1" in
        add-domain)
            add_domain "$2" "$3"
            ;;
        get-domain)
            get_domain "$2"
            ;;
        list-domains)
            list_domains
            ;;
        add-mailbox)
            add_mailbox "$2" "$3" "$4" "$5" "$6"
            ;;
        get-mailbox)
            get_mailbox "$2"
            ;;
        delete-mailbox)
            delete_mailbox "$2"
            ;;
        add-alias)
            add_alias "$2" "$3"
            ;;
        get-dkim)
            get_dkim "$2"
            ;;
        get-queue)
            get_queue
            ;;
        flush-queue)
            flush_queue
            ;;
        get-logs)
            get_logs "$2"
            ;;
        sync-mailbox)
            sync_mailbox_to_mailcow "$2"
            ;;
        *)
            echo "Usage: $0 {add-domain|get-domain|list-domains|add-mailbox|get-mailbox|delete-mailbox|add-alias|get-dkim|get-queue|flush-queue|get-logs|sync-mailbox}"
            echo ""
            echo "Examples:"
            echo "  $0 add-domain jubileebrowser.com 'Main Domain'"
            echo "  $0 add-mailbox support jubileebrowser.com 'Support Team' 'securepass123' 2048"
            echo "  $0 get-dkim jubileebrowser.com"
            exit 1
            ;;
    esac
fi
