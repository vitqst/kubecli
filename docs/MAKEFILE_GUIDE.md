# Makefile Guide

This project includes a Makefile for convenient command execution. All commands are cross-platform compatible.

## Quick Start

```bash
# Start development server
make dev
```

## Available Commands

### Development

**`make dev`** or **`make start`**
- Starts the application in development mode with hot reload
- Opens Electron window with DevTools
- Equivalent to `npm start`

```bash
make dev
```

### Build & Package

**`make build`**
- Builds the application for production
- Compiles TypeScript and bundles assets
- Output in `dist/` directory

```bash
make build
```

**`make package`**
- Packages the application for distribution
- Automatically runs build first
- Creates platform-specific installers in `out/`

```bash
make package
```

### Dependencies

**`make install`**
- Installs all npm dependencies
- Equivalent to `npm install`

```bash
make install
```

### Code Quality

**`make typecheck`**
- Checks TypeScript compilation without emitting files
- Useful for catching type errors before build

```bash
make typecheck
```

**`make lint`**
- Runs the linter (if configured)
- Currently shows "No linting configured"

```bash
make lint
```

**`make test`**
- Runs tests (when configured)
- Currently shows "No tests configured yet"

```bash
make test
```

### Cleanup

**`make clean`**
- Removes all build artifacts
- Cleans `dist/`, `out/`, and `.webpack/` directories

```bash
make clean
```

### Help

**`make help`** or **`make`**
- Shows all available commands with descriptions

```bash
make help
```

## Common Workflows

### Starting Development

```bash
# First time setup
make install

# Start development
make dev
```

### Before Committing

```bash
# Check TypeScript
make typecheck

# Clean and rebuild
make clean
make build
```

### Creating Distribution

```bash
# Build and package
make package
```

## Tips

1. **Default Command**: Running `make` without arguments shows the help menu
2. **Chaining**: You can run multiple commands: `make clean build`
3. **Emoji Support**: The Makefile uses emoji for better visual feedback
4. **Cross-Platform**: All commands work on Linux, macOS, and Windows (with make installed)

## Troubleshooting

### Make Not Found

**Linux/macOS:**
```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# macOS
xcode-select --install
```

**Windows:**
- Install [Chocolatey](https://chocolatey.org/) then run: `choco install make`
- Or use [WSL](https://docs.microsoft.com/en-us/windows/wsl/)

### Permission Errors

If you get permission errors during `make clean`:

```bash
# Linux/macOS
sudo make clean
```

## Integration with npm

All Makefile commands use npm scripts under the hood, so you can still use:

```bash
npm start          # Same as make dev
npm run build      # Same as make build
npm run package    # Same as make package
```

The Makefile is just a convenient wrapper for better developer experience.
