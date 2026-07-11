# Agent entry point

All working instructions for this repository live in **[CLAUDE.md](CLAUDE.md)** — read it first, whatever harness you are (pi, Codex, opencode, Claude Code, other). It covers the non-negotiable invariants (public-repo leakage boundary, wire-contract ownership, PKCE security controls), the layout, the terminology (kilde, komposition), and the delegation/QC process.

To understand the **kompo.ai service domain** this client talks to, start with [`knowledge.yaml`](knowledge.yaml) (public KCP manifest) and follow its units into [`docs/kcp/`](docs/kcp/).
