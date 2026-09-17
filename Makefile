# Cachewraith Explorer — common tasks. Run `make help` for the list.

APP        := cachewraith-explorer
PREFIX     ?= $(HOME)/.local
BIN_DIR    := $(PREFIX)/bin
APPS_DIR   := $(PREFIX)/share/applications
ICON_DIR   := $(PREFIX)/share/icons/hicolor/256x256/apps
RELEASE    := src-tauri/target/release/$(APP)

.PHONY: help setup dev check test format build package package-signed install set-default uninstall

help: ## Show this list
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

setup: ## Install JavaScript dependencies from the lockfile
	pnpm install --frozen-lockfile

dev: ## Run the app with hot reload
	pnpm tauri dev

check: ## Typecheck, lint and format-check both halves
	pnpm typecheck
	pnpm format:check
	cd src-tauri && cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings

test: ## Run frontend and backend tests
	pnpm test
	cd src-tauri && cargo test --locked

format: ## Format all sources
	pnpm format
	cd src-tauri && cargo fmt

build: ## Build an optimized binary (no distro package)
	pnpm tauri build --no-bundle

package: ## Build .deb, .rpm and AppImage for any distro (Docker, Ubuntu 22.04 base)
	mkdir -p dist-packages
	docker build -t $(APP)-builder packaging/docker
	docker run --rm \
		-v "$(CURDIR)":/src:ro \
		-v "$(CURDIR)/dist-packages":/out \
		-v $(APP)-cargo:/opt/cargo/registry \
		-v $(APP)-target:/build/src-tauri/target \
		-v $(APP)-pnpm:/root/.local/share/pnpm \
		-e HOST_UID=$$(id -u) -e HOST_GID=$$(id -g) \
		-e TAURI_SIGNING_PRIVATE_KEY -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
		$(APP)-builder
	@echo "Packages are in dist-packages/"

SIGNING_KEY ?= $(HOME)/.tauri/$(APP).key

package-signed: ## Like package, signed with the release key in ~/.tauri (for local releases)
	@test -r "$(SIGNING_KEY)" || { echo "No signing key at $(SIGNING_KEY)"; exit 1; }
	TAURI_SIGNING_PRIVATE_KEY="$$(cat "$(SIGNING_KEY)")" \
	TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$$(cat "$(SIGNING_KEY).password" 2>/dev/null)" \
	$(MAKE) package

install: build ## Install for the current user into ~/.local
	install -Dm755 $(RELEASE) $(BIN_DIR)/$(APP)
	install -Dm644 src-tauri/icons/128x128@2x.png $(ICON_DIR)/$(APP).png
	sed 's|@BIN@|$(BIN_DIR)/$(APP)|' packaging/$(APP).desktop > $(APPS_DIR)/$(APP).desktop
	-update-desktop-database $(APPS_DIR)
	@echo "Installed. Run 'make set-default' to open folders with it."

set-default: ## Make it the default app for folders (xdg-open, other apps)
	xdg-mime default $(APP).desktop inode/directory
	@echo "Folders now open with: $$(xdg-mime query default inode/directory)"

uninstall: ## Remove the user install (settings and thumbnails are kept)
	rm -f $(BIN_DIR)/$(APP) $(ICON_DIR)/$(APP).png $(APPS_DIR)/$(APP).desktop
	-update-desktop-database $(APPS_DIR)
