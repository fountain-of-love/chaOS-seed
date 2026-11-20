.PHONY: test test-node test-node-interop guardrails carve-out carve-out-undo

test test-node test-node-interop:
	@if [ -f test/Makefile ]; then \
	  CHAOS_CHECKOUT="$$PWD" make -C test -f Makefile "$@"; \
	else \
	  ./scripts/check.sh --rib test --required -- make -f Makefile "$@"; \
	fi

guardrails:
	@./scripts/check.sh --staged --rib guardrails --required -- make -f Makefile test

carve-out:
	@sh ./scripts/carve-out.sh "$${FOLDER:?Pass FOLDER=path/to/folder}" "$${REMOTE_URL:?Pass REMOTE_URL=git-remote-url}"

carve-out-undo:
	@sh ./scripts/carve-out.sh --undo "$${FOLDER:?Use make carve-out-undo FOLDER=path/to/folder}"
