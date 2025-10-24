.PHONY: help dev start build clean install lint test package

# Default target
help:
	@echo "KubeCLI - Kubernetes CLI Manager"
	@echo ""
	@echo "Available commands:"
	@echo "  make dev        - Start development server with hot reload"
	@echo "  make start      - Alias for 'make dev'"
	@echo "  make build      - Build the application for production"
	@echo "  make package    - Package the application for distribution"
	@echo "  make install    - Install dependencies"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make lint       - Run linter (if configured)"
	@echo "  make test       - Run tests (if configured)"
	@echo ""

# Start development server
dev:
	@echo "🚀 Starting KubeCLI in development mode..."
	npm start

# Alias for dev
start: dev

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install

# Build for production
build:
	@echo "🔨 Building application..."
	npm run build

# Package the application
package: build
	@echo "📦 Packaging application..."
	npm run package

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf out/
	rm -rf .webpack/
	@echo "✅ Clean complete"

# Run linter
lint:
	@echo "🔍 Running linter..."
	npm run lint

# Run tests
test:
	@echo "🧪 Running tests..."
	@echo "No tests configured yet"

# Check TypeScript compilation
typecheck:
	@echo "🔍 Checking TypeScript..."
	npx tsc --noEmit
	@echo "✅ TypeScript check passed"
