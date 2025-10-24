#!/bin/bash
set -e

echo "🐳 Building KubeCLI with Docker + Tauri..."
echo ""

# Build Docker image
echo "📦 Building Docker image..."
docker build -f Dockerfile.tauri -t kubecli-builder .

# Create container and copy output
echo ""
echo "📤 Extracting build artifacts..."
CONTAINER_ID=$(docker create kubecli-builder)

# Create output directory
mkdir -p dist-tauri

# Copy .deb file
docker cp $CONTAINER_ID:/app/src-tauri/target/release/bundle/deb/. dist-tauri/ || true

# Copy AppImage
docker cp $CONTAINER_ID:/app/src-tauri/target/release/bundle/appimage/. dist-tauri/ || true

# Cleanup
docker rm $CONTAINER_ID

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Output files:"
ls -lh dist-tauri/

echo ""
echo "🎉 Your tiny Tauri app is ready!"
echo ""
echo "To install:"
echo "  sudo dpkg -i dist-tauri/*.deb"
