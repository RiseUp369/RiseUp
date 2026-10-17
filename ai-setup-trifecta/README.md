# ai-setup-trifecta

A zero-cost, zero-dependency check that blocks any AI-assistant setup combining all three legs of
the "lethal trifecta". Idea credit: Simon Willison, https://simonwillison.net/2025/jun/16/the-lethal-trifecta/

## The three legs

- `private_data`: the tool can read things that are yours (mail, notes, files, calendar).
- `untrusted_content`: the tool lets in text someone else controls (web pages, inbound mail, issues).
- `external_comms`: the tool can send data out (send mail, post, call a URL, render a link).

Any one or two legs: ALLOWED. All three, across any mix of tools: BLOCKED, because injected
instructions can make the assistant read your data and send it out. A declared guardrail or
filter does not change that verdict: a 95% guardrail is still a failing grade. The fix is to
remove a leg, and the check suggests the leg with the fewest tools behind it.

## Tagging a tool

In a JSON file, list `setups`, each with an `id`, a `label` and `tools`. Give every tool an
`id`, a `label` and the `legs` it brings, for example
`{ "id": "synth-mail-reader", "label": "Synthetic mailbox reader", "legs": ["private_data", "untrusted_content"] }`.
Optional `mitigations` (`{ "kind": "guardrail" }`) are recorded but never trusted.
Synthetic data only: keys named `name`, `email` or `phone`, or any email-like value, are rejected.

## Running it (Node 22.6 or newer, nothing to install)

    node --experimental-strip-types --no-warnings src/cli.ts check fixtures/setups.synthetic.json
    node --experimental-strip-types --no-warnings --test test/trifecta.test.ts

One line per setup. Exit 0 if nothing is BLOCKED, 1 if anything is, 2 if the file is invalid.
