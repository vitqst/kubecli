# Docker Build Troubleshooting

## Common Issues

### 1. Missing System Libraries

**Error:**
```
The system library `libsoup-3.0` required by crate `soup3-sys` was not found.
```

**Solution:**
Added to Dockerfile:
```dockerfile
libsoup-3.0-dev
libjavascriptcoregtk-4.0-dev
```

### 2. Build Time

**Expected:**
- First build: 10-15 minutes
- Subsequent builds: 5 minutes (Docker cache)

**Progress Indicators:**
1. ✅ Downloading packages (2-3 min)
2. ✅ Installing Node.js (1 min)
3. ✅ Installing Rust (2 min)
4. ✅ npm install (2-3 min)
5. ✅ Vite build (1 min)
6. 🔄 Cargo build (5-10 min) ← Longest step
7. ✅ Creating .deb (30 sec)

### 3. Docker Not Installed

**Error:**
```
bash: docker: command not found
```

**Solution:**
```bash
sudo apt-get update
sudo apt-get install docker.io
sudo usermod -aG docker $USER
# Log out and back in
```

### 4. Permission Denied

**Error:**
```
permission denied while trying to connect to the Docker daemon
```

**Solution:**
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### 5. Out of Disk Space

**Error:**
```
no space left on device
```

**Solution:**
```bash
# Clean up Docker
docker system prune -a

# Check space
df -h
```

### 6. Build Fails Midway

**Solution:**
```bash
# Clean everything and rebuild
docker system prune -a
./build-tauri.sh
```

## Monitoring Build Progress

### Check Docker Build Logs
```bash
docker build -f Dockerfile.tauri -t kubecli-builder . 2>&1 | tee build.log
```

### Watch Build Progress
```bash
# In another terminal
docker ps
docker logs -f <container_id>
```

## Manual Build Steps

If the script fails, try manually:

```bash
# 1. Build image
docker build -f Dockerfile.tauri -t kubecli-builder .

# 2. Check if image was created
docker images | grep kubecli-builder

# 3. Create container
CONTAINER_ID=$(docker create kubecli-builder)
echo "Container ID: $CONTAINER_ID"

# 4. Extract .deb
mkdir -p dist-tauri
docker cp $CONTAINER_ID:/app/src-tauri/target/release/bundle/deb/. dist-tauri/

# 5. Extract AppImage
docker cp $CONTAINER_ID:/app/src-tauri/target/release/bundle/appimage/. dist-tauri/

# 6. Cleanup
docker rm $CONTAINER_ID

# 7. Check output
ls -lh dist-tauri/
```

## Verifying Output

### Expected Files
```
dist-tauri/
├── kubecli_1.0.0_amd64.deb      (~5MB)
└── kubecli_1.0.0_amd64.AppImage (~10MB)
```

### Test .deb Package
```bash
# Check package info
dpkg-deb -I dist-tauri/kubecli_1.0.0_amd64.deb

# List contents
dpkg-deb -c dist-tauri/kubecli_1.0.0_amd64.deb

# Install
sudo dpkg -i dist-tauri/kubecli_1.0.0_amd64.deb

# Run
kubecli
```

## Build Optimization

### Speed Up Subsequent Builds

Docker caches layers. To maximize cache hits:

1. **Don't change Dockerfile** - Reuses all layers
2. **Only change code** - Reuses system deps
3. **Use .dockerignore** - Exclude unnecessary files

### Create .dockerignore
```bash
cat > .dockerignore << 'EOF'
node_modules
dist
dist-tauri
.git
.webpack
*.log
*.backup
EOF
```

## Debugging Inside Container

### Run Interactive Shell
```bash
docker run -it kubecli-builder bash
```

### Check Build Artifacts
```bash
docker run -it kubecli-builder bash
# Inside container:
ls -lh /app/src-tauri/target/release/bundle/
```

### Test Commands
```bash
docker run -it kubecli-builder bash
# Inside container:
cd /app
npm run build
npm run tauri:build
```

## System Requirements

### Minimum
- Docker: 20.10+
- Disk space: 5GB free
- RAM: 4GB
- CPU: 2 cores

### Recommended
- Disk space: 10GB free
- RAM: 8GB
- CPU: 4 cores
- SSD storage

## Common Cargo Errors

### 1. Compilation Error
```
error: could not compile `app`
```

**Check:**
- Rust syntax errors in `src-tauri/src/*.rs`
- Missing dependencies in `Cargo.toml`
- Feature flags in `Cargo.toml`

### 2. Linking Error
```
error: linking with `cc` failed
```

**Check:**
- System libraries installed
- pkg-config working
- Library paths correct

### 3. Feature Not Found
```
error: the package 'app' does not contain this feature
```

**Check:**
- `[features]` section in `Cargo.toml`
- Feature dependencies correct

## Success Indicators

### Build Successful
```
✓ built in 1.28s
   Compiling app v0.1.0
    Finished release [optimized] target(s) in 8m 32s
    Bundling kubecli_1.0.0_amd64.deb
    Bundling kubecli_1.0.0_amd64.AppImage
```

### Files Created
```bash
ls -lh dist-tauri/
# Should show:
# -rw-r--r-- 1 user user 5.2M kubecli_1.0.0_amd64.deb
# -rwxr-xr-x 1 user user 9.8M kubecli_1.0.0_amd64.AppImage
```

## Getting Help

### Check Logs
```bash
# Docker build log
cat build.log

# Cargo build log
docker run -it kubecli-builder bash
cat /app/src-tauri/target/release/build/*/output
```

### Verify Dependencies
```bash
docker run -it kubecli-builder bash
# Inside container:
pkg-config --list-all | grep -E "(gtk|webkit|soup)"
```

### Test Rust Compilation
```bash
docker run -it kubecli-builder bash
# Inside container:
cd /app/src-tauri
cargo build --release
```

## Next Steps After Success

1. **Install .deb:**
   ```bash
   sudo dpkg -i dist-tauri/kubecli_1.0.0_amd64.deb
   ```

2. **Run app:**
   ```bash
   kubecli
   ```

3. **Compare size:**
   ```bash
   # Electron version
   ls -lh kubecli-1.0.0.deb  # 77MB
   
   # Tauri version
   ls -lh dist-tauri/kubecli_1.0.0_amd64.deb  # 5MB
   
   # 93% smaller! 🎉
   ```

## CI/CD Integration

### GitHub Actions
```yaml
name: Build Tauri App

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build with Docker
        run: ./build-tauri.sh
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: kubecli-packages
          path: dist-tauri/*
```

### GitLab CI
```yaml
build:
  image: docker:latest
  services:
    - docker:dind
  script:
    - ./build-tauri.sh
  artifacts:
    paths:
      - dist-tauri/
```
