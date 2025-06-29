#!/bin/bash

# TaskVision Local Development Docker Management Script

PROJECT_NAME="taskvision"
COMPOSE_FILE="docker-compose.local.yml"

case "$1" in
    "start")
        echo "🚀 Starting TaskVision local development environment..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d
        echo "✅ TaskVision containers started!"
        echo "📊 DynamoDB Local: http://localhost:8000"
        echo "🔧 DynamoDB Admin: http://localhost:8001"
        ;;
    
    "stop")
        echo "🛑 Stopping TaskVision containers..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down
        echo "✅ TaskVision containers stopped!"
        ;;
    
    "restart")
        echo "🔄 Restarting TaskVision containers..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d
        echo "✅ TaskVision containers restarted!"
        ;;
    
    "logs")
        echo "📋 Showing TaskVision container logs..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f
        ;;
    
    "status")
        echo "📊 TaskVision container status:"
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
        ;;
    
    "clean")
        echo "🧹 Cleaning up TaskVision containers and volumes..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down -v
        docker volume prune -f
        echo "✅ TaskVision environment cleaned!"
        ;;
    
    "setup")
        echo "🔧 Setting up TaskVision local development environment..."
        
        # Start containers
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d
        
        # Wait for DynamoDB to be ready
        echo "⏳ Waiting for DynamoDB to be ready..."
        sleep 5
        
        # Create table
        echo "📋 Creating DynamoDB table..."
        export IS_OFFLINE=true
        export AWS_REGION=us-east-1
        export AWS_ACCESS_KEY_ID=fakeMyKeyId
        export AWS_SECRET_ACCESS_KEY=fakeSecretAccessKey
        export TABLE_NAME=taskvision-local
        
        npx ts-node scripts/create-local-table.ts
        
        echo "✅ TaskVision setup complete!"
        echo "📊 DynamoDB Local: http://localhost:8000"
        echo "🔧 DynamoDB Admin: http://localhost:8001"
        echo ""
        echo "To start your backend server:"
        echo "IS_OFFLINE=true TABLE_NAME=taskvision-local npm start"
        ;;
    
    *)
        echo "TaskVision Docker Development Environment"
        echo ""
        echo "Usage: $0 {start|stop|restart|logs|status|clean|setup}"
        echo ""
        echo "Commands:"
        echo "  start   - Start TaskVision containers"
        echo "  stop    - Stop TaskVision containers"
        echo "  restart - Restart TaskVision containers"
        echo "  logs    - Show container logs"
        echo "  status  - Show container status"
        echo "  clean   - Remove containers and volumes (fresh start)"
        echo "  setup   - Complete setup (start containers + create table)"
        echo ""
        exit 1
        ;;
esac 