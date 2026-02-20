ENV_FILE := ./server/.env

# ── Dev environment ───────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start client (Vite) and server in parallel
	@npm run server & cd client && npm run dev

.PHONY: dev-client
dev-client: ## Start Vite dev server only
	cd client && npm run dev

.PHONY: dev-server
dev-server: ## Start Express server only
	cd server && node index.js

# ── Database ──────────────────────────────────────────────────────────────────

.PHONY: db-up
db-up: ## Start Postgres container
	docker compose --env-file $(ENV_FILE) up -d

.PHONY: db-down
db-down: ## Stop and remove Postgres container
	docker compose down

.PHONY: db-reset
db-reset: ## Destroy volume and recreate (wipes all data)
	docker compose down -v
	docker compose --env-file $(ENV_FILE) up -d

.PHONY: db-logs
db-logs: ## Tail Postgres container logs
	docker compose logs -f db

.PHONY: db-shell
db-shell: ## Open psql shell inside the container
	docker compose exec db psql -U intrview -d intrview

# ── Build & production ────────────────────────────────────────────────────────

.PHONY: build
build: ## Build the client for production
	cd client && npm run build

.PHONY: start
start: build ## Build client then start server (production mode)
	cd server && node index.js

# ── Dependencies ──────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install all dependencies (root + server + client)
	npm install
	cd server && npm install
	cd client && npm install

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
