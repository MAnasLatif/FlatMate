# FlatMate website

The public marketing website for FlatMate, built with Next.js. Its job is to explain what the app does and send visitors to Google Play and the App Store.

> **Status: not initialized.** The Next.js project has not been created yet.

## Scope

This site is for marketing only. It presents the product, links to the stores, and hosts public pages such as the privacy policy and terms.

It is not a web version of the app. It has no sign-in, stores no user data, and does not connect to the production database. If a web client for FlatMate is ever wanted, it will be a separate project.

## Stack

- Next.js with the App Router
- TypeScript in strict mode

## Rules specific to this folder

- Pages should be statically rendered wherever possible, load fast, and score well on Core Web Vitals.
- Use semantic HTML, support keyboard navigation, and keep contrast readable.
- Every page needs a title, description and social sharing metadata.
- Optimize images for the web and give them explicit dimensions to avoid layout shift.
- Only `NEXT_PUBLIC_` variables reach the browser, and they are public. No secrets here.
- Claims about the app must match what it really does. Check the [requirements](../docs/SRS.md) when describing features, and never imply that FlatMate moves money or verifies bank transfers.

## Scripts

Once initialized, this project provides the scripts CI depends on:

```sh
npm run lint
npm run typecheck
npm test
```

The general engineering rules are in [AGENTS.md](../AGENTS.md).
