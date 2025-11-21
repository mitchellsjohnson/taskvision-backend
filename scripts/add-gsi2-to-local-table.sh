#!/bin/bash

###############################################################################
# Add GSI2 to Existing LOCAL DynamoDB Table (Docker)
#
# This script adds GSI2 (phone number lookup) to your existing local
# TaskVision table WITHOUT recreating it or losing data.
#
# GSI2 Purpose: Reverse lookup from phone number to user
# Format: GSI2PK = "PHONE#+15551234567"
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

TABLE_NAME="TaskVision"
DYNAMODB_ENDPOINT="http://localhost:8000"
AWS_REGION="us-east-1"

# Fake credentials for local DynamoDB
export AWS_ACCESS_KEY_ID="fakeMyKeyId"
export AWS_SECRET_ACCESS_KEY="fakeSecretAccessKey"

echo -e "${GREEN}=== Adding GSI2 to Local DynamoDB Table ===${NC}"
echo "Table: $TABLE_NAME"
echo "Endpoint: $DYNAMODB_ENDPOINT"
echo ""

# Check if local DynamoDB is running
if ! curl -s "$DYNAMODB_ENDPOINT" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Local DynamoDB not responding at $DYNAMODB_ENDPOINT${NC}"
    echo ""
    echo "Start it with:"
    echo "  docker-compose -f docker-compose.dynamodb.yml up -d"
    echo "  OR"
    echo "  ./dev.sh start"
    exit 1
fi

echo -e "${GREEN}✓ Local DynamoDB is running${NC}"

# Check if table exists
if ! aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --endpoint-url "$DYNAMODB_ENDPOINT" \
    --region "$AWS_REGION" \
    --output json > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Table '$TABLE_NAME' not found${NC}"
    echo ""
    echo "Create it with:"
    echo "  npm run create-table"
    exit 1
fi

echo -e "${GREEN}✓ Table exists${NC}"

# Check if GSI2 already exists
GSI2_EXISTS=$(aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --endpoint-url "$DYNAMODB_ENDPOINT" \
    --region "$AWS_REGION" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI2'].IndexName" \
    --output text)

if [ -n "$GSI2_EXISTS" ]; then
    echo -e "${GREEN}✓ GSI2 already exists - nothing to do${NC}"

    # Show current indexes
    echo ""
    echo "Current indexes:"
    aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --endpoint-url "$DYNAMODB_ENDPOINT" \
        --region "$AWS_REGION" \
        --query "Table.GlobalSecondaryIndexes[].IndexName" \
        --output table

    exit 0
fi

# Add GSI2
echo -e "${YELLOW}Adding GSI2 index to local table...${NC}"
echo ""
echo "This will:"
echo "  ✓ Add GSI2 for phone number lookups"
echo "  ✓ Keep all existing data"
echo "  ✓ Keep GSI1 intact"
echo ""

aws dynamodb update-table \
    --table-name "$TABLE_NAME" \
    --endpoint-url "$DYNAMODB_ENDPOINT" \
    --region "$AWS_REGION" \
    --attribute-definitions AttributeName=GSI2PK,AttributeType=S \
    --global-secondary-index-updates \
    '[
        {
            "Create": {
                "IndexName": "GSI2",
                "KeySchema": [
                    {
                        "AttributeName": "GSI2PK",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                }
            }
        }
    ]'

echo ""
echo -e "${GREEN}✓ GSI2 added successfully${NC}"
echo ""
echo "Verify in DynamoDB Admin:"
echo "  http://localhost:8001"
echo ""
echo "GSI2 Usage:"
echo "  GSI2PK = 'PHONE#+15551234567'  // For phone number lookups"
echo ""
echo -e "${GREEN}Done!${NC}"
