#!/usr/bin/env bash
set -euo pipefail

# Console colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}  Infrastructure Provisioning: Fast Share           ${NC}"
echo -e "${BLUE}====================================================${NC}"

# Check if wrangler is available
if ! pnpm exec wrangler --version >/dev/null 2>&1; then
    echo -e "${RED}Error: Wrangler is not installed. Please run 'pnpm install' first.${NC}"
    exit 1
fi

BUCKET_NAME="fast-share-storage"
DB_NAME="fast-share-db"

# 1. R2 Storage Bucket
echo -e "\n${YELLOW}[1/4] Verifying R2 Bucket: ${BUCKET_NAME}...${NC}"
if pnpm exec wrangler r2 bucket list 2>/dev/null | grep -q "${BUCKET_NAME}"; then
    echo -e "${GREEN}✓ R2 bucket '${BUCKET_NAME}' already exists.${NC}"
else
    echo -e "Creating R2 bucket '${BUCKET_NAME}'..."
    pnpm exec wrangler r2 bucket create "${BUCKET_NAME}"
    echo -e "${GREEN}✓ R2 bucket created successfully.${NC}"
fi

# 2. R2 Lifecycle Rule (24h purge for temporal/ prefix)
echo -e "\n${YELLOW}[2/4] Configuring 24h lifecycle rule for temporary objects in R2...${NC}"
pnpm exec wrangler r2 bucket lifecycle add "${BUCKET_NAME}" --prefix "temporal/" --expire-days 1 2>/dev/null || true
echo -e "${GREEN}✓ R2 lifecycle rule processed.${NC}"

# 3. Cloudflare D1 SQL Database
echo -e "\n${YELLOW}[3/4] Verifying D1 Database: ${DB_NAME}...${NC}"
DB_LIST=$(pnpm exec wrangler d1 list --json 2>/dev/null || echo "[]")
EXISTING_DB_ID=$(echo "${DB_LIST}" | grep -B 2 -A 5 "\"name\": \"${DB_NAME}\"" | grep '"uuid":' | head -n1 | cut -d'"' -f4 || true)

if [ -n "${EXISTING_DB_ID}" ]; then
    echo -e "${GREEN}✓ D1 database '${DB_NAME}' already exists (ID: ${EXISTING_DB_ID}).${NC}"
else
    echo -e "Creating D1 database '${DB_NAME}'..."
    CREATE_OUTPUT=$(pnpm exec wrangler d1 create "${DB_NAME}")
    echo "${CREATE_OUTPUT}"
    EXISTING_DB_ID=$(echo "${CREATE_OUTPUT}" | grep -o '"database_id": "[^"]*"' | cut -d'"' -f4 || true)
    if [ -z "${EXISTING_DB_ID}" ]; then
        EXISTING_DB_ID=$(echo "${CREATE_OUTPUT}" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2 || true)
    fi
fi

if [ -n "${EXISTING_DB_ID}" ]; then
    # Inject database_id into wrangler.jsonc safely
    if grep -q "placeholder-id-run-infra-init" wrangler.jsonc; then
        echo -e "Updating database_id in wrangler.jsonc..."
        node -e "
            const fs = require('fs');
            let content = fs.readFileSync('wrangler.jsonc', 'utf8');
            content = content.replace('placeholder-id-run-infra-init', '${EXISTING_DB_ID}');
            fs.writeFileSync('wrangler.jsonc', content);
        "
        echo -e "${GREEN}✓ wrangler.jsonc updated with database_id: ${EXISTING_DB_ID}${NC}"
    fi
fi

# 4. Remote D1 Migrations
echo -e "\n${YELLOW}[4/4] Applying SQL migrations to remote Cloudflare D1...${NC}"
echo "y" | pnpm exec wrangler d1 migrations apply "${DB_NAME}" --remote

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}  ✓ Base infrastructure provisioned successfully    ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Next step to publish application (Worker + React + Subdomains):"
echo -e "  ${BLUE}pnpm run deploy${NC}\n"
