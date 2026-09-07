# Same Sun — a day with Ladoo

One page, two people, one shared day. Both of you open the same link and the page
behaves like a single room: cursors, clicks, picks, scores, drawings and chat all
cross between the two screens live.

## How it works

- `public/index.html` — the whole site, one file. All twelve hours plus the five
  arcade games render from shared state and write back to it.
- `src/index.js` — a Cloudflare Worker. It serves the page, and upgrades
  `/room?r=<name>` to a WebSocket handled by a Durable Object (`DayRoom`), one
  object per room. The object keeps the room's state and broadcasts every change.

State lives in the Durable Object, not in anyone's browser, so a reload or a dead
phone doesn't lose the day — you rejoin and land back in whatever hour the other
person has open.

Two kinds of message cross the wire:

| kind | used for | stored? |
| --- | --- | --- |
| `set` / `push` / `wipe` | picks, scores, boards, lists, chat | yes |
| `ev` | cursor positions, click ripples, live pen strokes, typing | no |

## Rooms

Everyone on the same URL is in the same room. The default room is `same-sun`;
`?r=anything` makes a separate one. Send the other person the exact link.

Names matter: typing `Ladoo` or `Jitendra` at the gate takes that side of the
two-sided activities (whose turn it is, whose four dishes, whose drawing pad).
Any other name joins as a guest and shares the second seat.

## Running it locally

```
npm install
npm run dev          # http://localhost:8787
```

Open it in two windows with different names to see both sides.

## Deploying

```
npm run deploy
```

Or connect this repo to the Worker in the Cloudflare dashboard
(**Workers & Pages → the Worker → Settings → Builds → Connect**) and every push
to the branch deploys.

Two things that will break a Git-connected build:

- The Worker's name in the dashboard must match `name` in `wrangler.jsonc`
  (currently `a-day`). Rename one or the other so they agree.
- A **Missing git connection** notice on the Builds tab means the Cloudflare
  GitHub App authorization behind the trigger is gone — uninstalled, or the repo
  isn't in its "only select repositories" list. Fix it under
  **Settings → Builds → Disconnect**, then **Connect** and re-authorize, granting
  the app access to this repo.

## Cost

Durable Objects here use the SQLite storage backend and the WebSocket Hibernation
API, so a room with nobody moving isn't billed for wall-clock time.
