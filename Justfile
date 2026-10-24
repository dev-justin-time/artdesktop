# Build the entire 10-app monorepo
build:
    cargo build --release --workspace

# Run the unified studio shell in dev mode (Requires Node.js)
dev:
    cd crates/craft-studio-shell && cargo tauri dev

# Build signed Windows installers using an installed code-signing certificate
signed-bundle:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-signed.ps1

# Check all modules for errors
check:
    cargo check --workspace --all-targets

# Run the exact same checks as the GitHub Actions CI pipeline locally
ci:
    cd crates/craft-studio-shell/ui && npm ci && npm run build
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings
    cargo test --workspace
    cargo build --release --workspace

# Format code
fmt:
    cargo fmt --all