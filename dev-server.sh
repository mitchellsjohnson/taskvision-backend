#!/bin/bash

# TaskVision Development Server Manager
# Usage: ./dev-server.sh [start|stop|restart|status]
# Run from taskvision-backend/ directory

BACKEND_DIR="."
FRONTEND_DIR="../taskvision-frontend"
PROJECT_ROOT="$(dirname "$(pwd)")"
LOG_DIR="$HOME/.local/share/taskvision/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create log directory if it doesn't exist
setup_logs() {
    mkdir -p "$LOG_DIR"
}

# Function to check if a process is running
check_backend() {
    pgrep -f "ts-node-dev.*src/index.ts" > /dev/null
    return $?
}

check_frontend() {
    # Check for any frontend-related processes
    pgrep -f "cross-env PORT=4040.*react-scripts" > /dev/null || \
    pgrep -f "taskvision-frontend.*react-scripts" > /dev/null || \
    lsof -i :4040 > /dev/null 2>&1
    return $?
}

check_dynamodb() {
    docker ps --filter "name=dynamodb-local" --filter "status=running" --format "{{.Names}}" | grep -q "dynamodb-local"
    return $?
}

# Function to kill processes
kill_backend() {
    print_status "Stopping backend server..."
    pkill -f "ts-node-dev.*src/index.ts"
    sleep 2
    if check_backend; then
        print_warning "Backend still running, force killing..."
        pkill -9 -f "ts-node-dev.*src/index.ts"
    fi
    print_success "Backend stopped"
}

kill_frontend() {
    print_status "Stopping frontend server..."
    
    # Kill all frontend-related processes
    pkill -f "cross-env PORT=4040.*react-scripts" 2>/dev/null
    pkill -f "taskvision-frontend.*react-scripts" 2>/dev/null
    pkill -f "taskvision-frontend.*dotenv" 2>/dev/null
    
    # Force kill anything still on port 4040
    local port_pids=$(lsof -ti :4040 2>/dev/null)
    if [ -n "$port_pids" ]; then
        echo $port_pids | xargs kill 2>/dev/null
    fi
    
    sleep 2
    
    if check_frontend; then
        print_warning "Frontend still running, force killing..."
        pkill -9 -f "cross-env PORT=4040.*react-scripts" 2>/dev/null
        pkill -9 -f "taskvision-frontend.*react-scripts" 2>/dev/null
        pkill -9 -f "taskvision-frontend.*dotenv" 2>/dev/null
        
        # Force kill port 4040 processes
        local remaining_pids=$(lsof -ti :4040 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            echo $remaining_pids | xargs kill -9 2>/dev/null
        fi
        
        sleep 1
    fi
    print_success "Frontend stopped"
}

# Function to start services
start_dynamodb() {
    if ! check_dynamodb; then
        print_status "Starting DynamoDB Local with persistent storage..."
        
        # Clean up any existing container
        docker stop dynamodb-local 2>/dev/null && docker rm dynamodb-local 2>/dev/null
        
        # Create data directory if it doesn't exist
        mkdir -p ~/.local/share/taskvision/dynamodb-data
        
        docker run -d --name dynamodb-local -p 8000:8000 \
            -v "$HOME/.local/share/taskvision/dynamodb-data:/home/dynamodblocal/data" \
            amazon/dynamodb-local:latest \
            -jar DynamoDBLocal.jar -dbPath /home/dynamodblocal/data -port 8000
        sleep 3
        
        # Create table if it doesn't exist
        print_status "Ensuring TaskVision table exists..."
        AWS_ACCESS_KEY_ID=fakeKey AWS_SECRET_ACCESS_KEY=fakeSecret \
        aws dynamodb describe-table --table-name TaskVision \
        --endpoint-url http://localhost:8000 --region us-east-1 > /dev/null 2>&1
        
        if [ $? -ne 0 ]; then
            print_status "Creating TaskVision table..."
            # Use inline Node.js script to create table
            node -e "
            const AWS = require('aws-sdk');
            AWS.config.update({
                region: 'us-east-1',
                endpoint: 'http://localhost:8000',
                accessKeyId: 'fakeKey',
                secretAccessKey: 'fakeSecret'
            });
            const dynamodb = new AWS.DynamoDB();
            dynamodb.createTable({
                TableName: 'TaskVision',
                KeySchema: [
                    { AttributeName: 'PK', KeyType: 'HASH' },
                    { AttributeName: 'SK', KeyType: 'RANGE' }
                ],
                AttributeDefinitions: [
                    { AttributeName: 'PK', AttributeType: 'S' },
                    { AttributeName: 'SK', AttributeType: 'S' },
                    { AttributeName: 'GSI1PK', AttributeType: 'S' },
                    { AttributeName: 'GSI1SK', AttributeType: 'S' }
                ],
                GlobalSecondaryIndexes: [{
                    IndexName: 'GSI1',
                    KeySchema: [
                        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
                        { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }],
                BillingMode: 'PAY_PER_REQUEST'
            }, (err) => {
                if (err && err.code !== 'ResourceInUseException') {
                    console.error('❌ Error:', err.message);
                    process.exit(1);
                } else {
                    console.log('✅ Table ready');
                    process.exit(0);
                }
            });" || {
                print_error "Failed to create table"
                return 1
            }
        fi
        print_success "DynamoDB Local ready on http://localhost:8000 (persistent mode)"
    else
        print_success "DynamoDB Local already running"
    fi
}

start_backend() {
    if check_backend; then
        print_warning "Backend already running"
        return 0
    fi
    
    setup_logs
    print_status "Starting backend server..."
    cd "$BACKEND_DIR"
    
    # Set environment variables for local development
    export IS_OFFLINE=true
    export TABLE_NAME=TaskVision
    export AWS_REGION=us-east-1
    export AWS_ACCESS_KEY_ID=fakeKey
    export AWS_SECRET_ACCESS_KEY=fakeSecret
    
    nohup npm start > "$LOG_DIR/backend.log" 2>&1 &
    sleep 3
    
    if check_backend; then
        print_success "Backend started on http://localhost:6060"
        print_status "Logs: tail -f $LOG_DIR/backend.log"
    else
        print_error "Failed to start backend - check $LOG_DIR/backend.log"
        return 1
    fi
}

start_frontend() {
    if check_frontend; then
        print_warning "Frontend already running"
        return 0
    fi
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        print_error "Frontend directory not found: $FRONTEND_DIR"
        print_error "Make sure taskvision-frontend is in the parent directory"
        return 1
    fi
    
    setup_logs
    print_status "Starting frontend server..."
    cd "$FRONTEND_DIR"
    
    nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
    sleep 5
    
    if check_frontend; then
        print_success "Frontend started on http://localhost:4040"
        print_status "Logs: tail -f $LOG_DIR/frontend.log"
    else
        print_error "Failed to start frontend - check $LOG_DIR/frontend.log"
        return 1
    fi
    cd - > /dev/null
}

# Function to show status
show_status() {
    echo -e "\n${BLUE}=== TaskVision Development Status ===${NC}"
    
    if check_dynamodb; then
        print_success "DynamoDB Local: Running (http://localhost:8000)"
    else
        print_error "DynamoDB Local: Not running"
    fi
    
    if check_backend; then
        print_success "Backend: Running (http://localhost:6060)"
    else
        print_error "Backend: Not running"
    fi
    
    if check_frontend; then
        print_success "Frontend: Running (http://localhost:4040)"
    else
        print_error "Frontend: Not running"
    fi
    echo ""
}

# Function to open services in browser
open_services() {
    print_status "Opening TaskVision services in browser..."
    sleep 2
    
    if command -v open >/dev/null; then
        # macOS
        open http://localhost:4040  # Frontend
        open http://localhost:6060  # Backend (if has a UI)
    elif command -v xdg-open >/dev/null; then
        # Linux
        xdg-open http://localhost:4040
        xdg-open http://localhost:6060
    else
        print_status "Open manually:"
        print_status "Frontend: http://localhost:4040"
        print_status "Backend API: http://localhost:6060"
    fi
}

# Main script logic
case "$1" in
    "start")
        print_status "Starting TaskVision development environment..."
        start_dynamodb
        start_backend
        start_frontend
        show_status
        
        if [ "$2" = "--open" ] || [ "$2" = "-o" ]; then
            open_services
        fi
        ;;
    
    "stop")
        print_status "Stopping TaskVision development environment..."
        kill_frontend
        kill_backend
        docker stop dynamodb-local 2>/dev/null && docker rm dynamodb-local 2>/dev/null
        print_success "All services stopped"
        ;;
    
    "restart")
        print_status "Restarting TaskVision development environment..."
        kill_frontend
        kill_backend
        sleep 2
        start_dynamodb
        start_backend
        start_frontend
        show_status
        ;;
    
    "status")
        show_status
        ;;
    
    "logs")
        case "$2" in
            "backend"|"be")
                if [ -f "$LOG_DIR/backend.log" ]; then
                    tail -f "$LOG_DIR/backend.log"
                else
                    print_error "Backend log not found. Is the backend running?"
                fi
                ;;
            "frontend"|"fe")
                if [ -f "$LOG_DIR/frontend.log" ]; then
                    tail -f "$LOG_DIR/frontend.log"
                else
                    print_error "Frontend log not found. Is the frontend running?"
                fi
                ;;
            *)
                print_status "Available logs:"
                [ -f "$LOG_DIR/backend.log" ] && print_status "  $LOG_DIR/backend.log ($(stat -f%z "$LOG_DIR/backend.log" 2>/dev/null || stat -c%s "$LOG_DIR/backend.log" 2>/dev/null) bytes)"
                [ -f "$LOG_DIR/frontend.log" ] && print_status "  $LOG_DIR/frontend.log ($(stat -f%z "$LOG_DIR/frontend.log" 2>/dev/null || stat -c%s "$LOG_DIR/frontend.log" 2>/dev/null) bytes)"
                print_status "Usage: $0 logs [backend|frontend]"
                ;;
        esac
        ;;
    
    "open")
        open_services
        ;;
    
    *)
        echo "TaskVision Development Server Manager"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|open}"
        echo ""
        echo "Commands:"
        echo "  start [--open]  - Start all services (DynamoDB, Backend, Frontend)"
        echo "  stop            - Stop all services"
        echo "  restart         - Restart all services"
        echo "  status          - Show current status"
        echo "  logs [be|fe]    - Show logs (backend|frontend)"
        echo "  open            - Open services in browser"
        echo ""
        echo "Services:"
        echo "  DynamoDB Local: http://localhost:8000"
        echo "  Backend API:    http://localhost:6060"
        echo "  Frontend App:   http://localhost:4040"
        echo ""
        echo "Logs stored in: $LOG_DIR"
        echo ""
        echo "Example:"
        echo "  $0 start --open    # Start everything and open in browser"
        echo "  $0 logs backend    # Watch backend logs"
        echo ""
        exit 1
        ;;
esac 