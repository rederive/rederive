# The rederive Promise
### Open-Core Stewardship Charter

**Version 1.0 · 2026-06-15 · Apilify Inc.**
*A public, binding commitment. Written down so it can be held against us.*

---

## 0. Why this document exists

rederive's product is **trust**. A "trust-nothing" package manager whose steward can be trusted only on their word is a contradiction — so we are not asking for your word, we are signing ours.

We have watched this movie. An open project earns a community, becomes load-bearing infrastructure, and then — under growth pressure or an investor's spreadsheet — relicenses, hobbles the free tier, or quietly betrays the people who built its adoption. (Terraform → BSL → the OpenTofu fork is the canonical case.) The community always knew it was possible, because nothing was ever promised in writing.

This charter is that writing. It defines what is open and stays open, what we will charge for, and — most importantly — **what we will never do**. It binds Apilify Inc. regardless of ownership, funding, board, or acquisition.

## 1. The core principle: make something awesome, first

**The mission is to build the best verified-recompose toolchain and the most useful catalog of verified packages in the world, and give it away.** Monetization *follows* adoption; it never precedes it and never compromises it. We will not cripple the open core to manufacture a reason to pay. If a feature is needed to verify or re-derive software, it lives in the open core — full stop.

Greatness of the free thing is the strategy, not a loss leader for it.

## 2. What is open — and stays open

The **open core** is licensed **Apache-2.0** and comprises, at minimum:

- The **`rdv` CLI** — `check`, `vis`, `resynth`, and any command required to verify or re-derive a package.
- The **SIR specification and format** — the contract grammar and the bundle layout, developed as an open standard.
- The **verified-recompose loop** — decompile → held-out oracle → quorum re-derivation.
- The **public catalog** of `@rederive/*` verified packages and their contracts.

**The durability promise:**

- **Released open versions stay open forever.** The Apache-2.0 grant on anything we have published is irrevocable. There is no "change date," no clawback.
- **The line moves only outward.** We may open *more*; we will not close what is open.
- **No retroactive relicensing.** If we ever change the license of *future* work, it applies only going forward, is announced publicly in advance, and never touches a version already released. Your right to fork the last open release is guaranteed by the license and sacred to us.

## 3. The catalog is a public good

Re-releasing verified, dependency-free replacements for abandoned, sabotaged, or risky packages is **a gift to the commons** — and, frankly, our best marketing. Every `@rederive/*` package is proof the method works, in public, for free.

- **The public catalog is free, forever.**
- **We will never paywall the ability to verify or re-derive a public package.** If `colors` is in the catalog, anyone can `rdv check` or `rdv resynth` it at no cost, today and always.
- We publish the contract (spec + held-out oracle + hashes), not just the bytes, so the verification is yours to run, not ours to gatekeep.

## 4. What we charge for — and what we never will

Revenue comes from making rederive better **for teams and enterprises operating it at scale** — value a fork of the CLI does not hand you. Fair game:

- **Managed re-derivation** — hosted, on-demand, so you don't run the fleet or spend your own tokens.
- **Private catalogs** — verifying and re-deriving your *internal/proprietary* code, kept private.
- **Continuous verification** — auto-re-derive and diff the contract when an upstream dependency changes; alert on behavioral drift.
- **Governance** — org policy, SSO/SAML, RBAC, audit logs.
- **Compliance attestation** — EU CRA / SSDF / SOC 2 evidence: cryptographic proof every dependency was verified against a held-out oracle, with the audit trail.
- **Support, SLAs, and indemnification.**

**We will never:**

- Charge to verify or re-derive a **public** package.
- Remove or degrade a core capability to force a paid upgrade ("open-core bait").
- Ship a deliberately hobbled open version next to a "real" paid one.
- Put the **file format or specification** behind a license, fee, or patent assertion against conforming implementations.
- Sell, broker, or condition the product on user telemetry or ads in the open-source tool.
- Use a contributor agreement to relicense contributors' work out from under them.

## 5. How we treat the community

- **Contributions are credited.** We use a lightweight DCO/contributor model; we do not take a CLA that lets us privatize what you gave us.
- **We upstream our fixes** to the open core rather than hoarding them for the paid tier.
- **We do not compete unfairly with our own ecosystem.** If someone builds a great thing on rederive, we don't clone-and-bundle it to kill them.
- **Security findings are handled in the open**, with credit, on a responsible-disclosure timeline.

## 6. Monetization timing

We will not introduce paid tiers until the open core is genuinely adopted and *loved* — measured by real usage, not by our impatience for revenue. When paid tiers arrive, the test for every one of them is the same:

> **Does this make the team/enterprise experience better — without making the individual/open-source experience worse?**

If a proposed paid feature only works by degrading the free experience, it fails this charter and we don't ship it.

## 7. The anti-rug-pull mechanism

These promises are not aspirational; they are a **condition of the trust that is the company's primary asset.** Breaking them does not unlock revenue — it destroys the moat. We state that plainly here so that any future pressure to violate this charter is met with this sentence: *doing so vaporizes the thing that makes rederive valuable.*

- This charter binds Apilify Inc. **through any change of ownership, investment, board composition, or acquisition.**
- **Amendments** to this document are published openly, take effect only going forward, and never retroactively reduce a freedom already granted.
- The community's **right to fork** the open core is permanent and guaranteed by the Apache-2.0 license. We consider a fork the ultimate check on us, and we accept it.

*(We additionally commit to evaluate, as the company matures, an **eventual-open guarantee** — converting commercial source to the open license after a fixed period — as a further trust mechanism. This clause is a commitment to consider, recorded so we are held to the conversation.)*

---

**Signed,**
Lane Thompson — Founder & CEO, Apilify Inc.

*Published at rederive.ai. This is the canonical version; supersedes any contrary statement elsewhere. To report a violation, open an issue or email lane@apilify.com.*
