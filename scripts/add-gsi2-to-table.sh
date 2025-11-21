#!/bin/bash

###############################################################################
# Add GSI2 Index to Existing DynamoDB Table
#
# This script safely adds GSI2 (phone number lookup) to the existing
# TaskVision DynamoDB table without affecting data or GSI1.
#
# GSI2 Purpose: Reverse lookup from phone number to user
# Format: GSI2PK = "PHONE#+15551234567"
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TABLE_NAME="${TABLE_NAME:-TaskVision}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-default}"

echo -e "${GREEN}=== Adding GSI2 to DynamoDB Table ===${NC}"
echo "Table: $TABLE_NAME"
echo "Region: $AWS_REGION"
echo ""

# Check if table exists
echo -e "${YELLOW}Checking if table exists...${NC}"
if ! aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output json > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Table '$TABLE_NAME' not found in region $AWS_REGION${NC}"
    echo "Please create the table first or check your AWS credentials."
    exit 1
fi

echo -e "${GREEN}✓ Table exists${NC}"

# Check if GSI2 already exists
echo -e "${YELLOW}Checking if GSI2 already exists...${NC}"
GSI2_EXISTS=$(aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI2'].IndexName" \
    --output text)

if [ -n "$GSI2_EXISTS" ]; then
    echo -e "${GREEN}✓ GSI2 already exists - nothing to do${NC}"

    # Show GSI2 status
    GSI2_STATUS=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI2'].IndexStatus" \
        --output text)

    echo "GSI2 Status: $GSI2_STATUS"
    exit 0
fi

# Add GSI2
echo -e "${YELLOW}Adding GSI2 index (this may take a few minutes)...${NC}"
echo ""
echo "This operation:"
echo "  - Adds a new Global Secondary Index (GSI2)"
echo "  - Does NOT affect existing data"
echo "  - Does NOT affect GSI1"
echo "  - Can be done on live tables"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

aws dynamodb update-table \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
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
                },
                "ProvisionedThroughput": {
                    "ReadCapacityUnits": 5,
                    "WriteCapacityUnits": 5
                }
            }
        }
    ]'

echo -e "${GREEN}✓ GSI2 index creation initiated${NC}"
echo ""
echo -e "${YELLOW}Waiting for index to become ACTIVE...${NC}"
echo "(This typically takes 2-5 minutes)"

# Wait for index to be active
while true; do
    STATUS=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI2'].IndexStatus" \
        --output text)

    if [ "$STATUS" == "ACTIVE" ]; then
        echo -e "${GREEN}✓ GSI2 is now ACTIVE${NC}"
        break
    elif [ "$STATUS" == "CREATING" ]; then
        echo -n "."
        sleep 10
    else
        echo -e "${RED}ERROR: Unexpected status: $STATUS${NC}"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}=== GSI2 Successfully Added ===${NC}"
echo ""
echo "Index Details:"
aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI2']" \
    --output table

echo ""
echo -e "${GREEN}Done! GSI2 is ready for use.${NC}"
echo ""
echo "Usage in code:"
echo "  GSI2PK = 'PHONE#+15551234567'  // For phone number lookups"
