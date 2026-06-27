# Default: list recipes
default:
    @just --list

# Development (watch mode)
dev:
    bun run dev

# Production start
start:
    bun src/index.ts

# Lint check
lint:
    bun run lint:check

# Lint fix
lint-fix:
    bun run lint:fix

# Format check
fmt:
    bun run fmt:check

# Format fix
fmt-fix:
    bun run fmt:fix

# TypeScript type check
typecheck:
    bun check

# Run tests (once)
test:
    bun run test

# Run all checks: fmt + lint + typecheck + test
check:
    bun run check && just typecheck && just test
