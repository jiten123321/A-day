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

## Chat

The chat is one thread across both devices. It also takes pictures and GIFs:
the picture button, a paste into the message box, or a drop anywhere on the
chat panel. Add text before sending and it rides along as a caption. Tap a
picture to open it full size.

Anything that is not a GIF is resized to fit 1280px and re-encoded as WebP
before it leaves the browser, which is the difference between a 6MB phone photo
and something that arrives instantly. GIFs are sent untouched, because
re-encoding one costs the animation. The wire limit is 3MB after that step.

Images are stored in the room's Durable Object in 64KB chunks, so no single
stored value is large. Each room keeps its 60 most recent images and at most
24MB; older ones fall off. Clearing the thread deletes its pictures too.

A short chime plays when a message arrives from the other person — never for
your own. **Sound on / Sound off** in the chat toolbar toggles it, and the
choice is remembered per browser. Browsers only allow audio after a click or
keypress, so the first gesture on the page arms it.

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

### The first build has to be a `wrangler deploy` on the production branch

This Worker declares a Durable Object with a `new_sqlite_classes` migration.
Migrations are only applied by `wrangler deploy`. Workers Builds runs
`wrangler deploy` on the **production branch** but defaults to
`npx wrangler versions upload` on every other branch, and a version upload
cannot create the `DayRoom` namespace. So a build on a feature branch will not
succeed until the class exists — get one `wrangler deploy` through from the
production branch first (merge, or run `npm run deploy` locally), after which
branch builds work normally.

Related: Cloudflare does not generate preview URLs for Workers that implement a
Durable Object, so branch builds won't produce one here.

### Two things that will break a Git-connected build:

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
