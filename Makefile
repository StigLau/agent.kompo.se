.PHONY: help kli init auth-url auth-status health tools verify-access contract-public contract-auth pi-kli-readonly first-video

# Public end-user shortcuts. Backend deployment and operational targets deliberately
# do not belong in this repository; see `kli help` for the full client command set.
ENV ?= prod
ARGS ?=

help:
	@echo "@kompo/kli public client"
	@echo ""
	@echo "  make kli ARGS='--env test health'   Run any KLI command"
	@echo "  make init                            Write agent context in this directory"
	@echo "  make auth-url ENV=test               Start PKCE login"
	@echo "  make auth-status ENV=test            Show login status"
	@echo "  make health ENV=test                 Check API and discovery"
	@echo "  make tools ENV=test                  Fetch the public tools manifest"
	@echo "  make verify-access ARGS='--public-only'  Verify public/authenticated KLI access"
	@echo "  make contract-public                 Run public deployed contract tests"
	@echo "  make contract-auth                   Run read-only authenticated contract tests"
	@echo "  make pi-kli-readonly ARGS='...'      Delegate only fixed read-only KLI test gates to Pi"
	@echo "  make first-video                     Run the mutating first-video scenario"

kli:
	@bun src/cli.ts $(ARGS)

init:
	@bun src/cli.ts --env $(ENV) init

auth-url:
	@bun src/cli.ts --env $(ENV) auth/url

auth-status:
	@bun src/cli.ts --env $(ENV) auth/status

health:
	@bun src/cli.ts --env $(ENV) health

tools:
	@bun src/cli.ts --env $(ENV) tools

verify-access:
	@bun scripts/verify-access.ts $(ARGS)

contract-public:
	@bun run contract:public

contract-auth:
	@bun run contract:auth

pi-kli-readonly:
	@bash scripts/pi-kli-readonly.sh "$(ARGS)"

first-video:
	@bun run scenario:first-video
