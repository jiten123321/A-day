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

## The arcade games

Twelve games, all shared — every move lands on both boards.

**Chess** is the real thing: legal move generation, castling (including through
check), en passant, promotion with a picker, check, checkmate, stalemate and the
fifty-move draw. The board is flipped for whoever is playing black. Rules are
verified by perft — 197,281 nodes at depth 4 from the start, and 97,862 at depth
3 from the Kiwipete position, both exact.

**Ludo** is the two-player game on a proper 52-square board: sixes to leave the
yard and to roll again, capture on any square that isn't a star, and the exact
number to get home. **Snake** gives you a board each, both live, so you watch
the other one play while you play. **Hangman** has one of you set a word and the
other spend six wrong guesses on it.

Also **tic tac toe**, **dots and boxes** (close a box, go again) and
**rock paper scissors** (both pick in secret, both reveal at once), alongside
the original connect four, emoji films, never have I ever, word chain and who's
more likely.

### Seats

The two-player games need one person in each seat. Seats are worked out from
the room's peer list — identically on every screen, so nobody has to agree
about it — with the names in `CFG` used only as a preference:

- If someone typed the name in `CFG.her`, they take that seat; likewise
  `CFG.you`.
- Anyone else fills the remaining seats in a stable order.

That matters because the seat used to come from the name alone, which meant two
people who both typed the same name — or neither of the two names — landed in
the *same* seat, and every turn-based game deadlocked with nobody able to move.

Labels show whoever is actually sitting there, not the configured names.

**On your own you may move for both sides**, so a game is still playable before
the other one arrives rather than stuck on a turn that can never come.

## Look

The whole thing is a doodle: pen on paper rather than the old night theme.

- **Handwriting throughout** — Caveat for headings, Patrick Hand for everything
  else, both self-hosted from `public/fonts/` so there is no font-CDN
  dependency and the page can never render half-styled while one is slow.
- **Hand-drawn outlines.** Every component's border is a `::before` overlay run
  through an SVG turbulence filter (`#wob1`/`#wob2`/`#wob3` in the page). Only
  the line is distorted, never the text inside it — which is why the filter is
  on an overlay rather than on the element.
- Uneven corner radii, a fraction of a degree of rotation on cards and message
  bubbles, and a scribbled underline beneath each hour's heading.
- Faint ruled-and-squared paper under everything, and the glitter falls as
  little pen marks — asterisks, crosses and dots — rather than round specks.

The palette tokens kept their names, so `--paper` is the ink and `--night` is
the page. Every existing rule therefore keeps meaning what it meant.

## The page

The header carries an analog watch rather than a digital clock, and the hour
rows are just a title, a one-line description and a button — no timestamps.
Each activity's own header says which stop it is.

Behind everything, a slow glitter rain on one fixed canvas: density scales with
the viewport and caps at 120 flecks, they twinkle on their own phases and drift
sideways as they fall. It idles when the tab is hidden and holds still for
prefers-reduced-motion.

## A hug

A **hug** button sits above the chat, available at any hour rather than being
one of the twelve stops. It opens on both screens, and whoever presses it, the
hug plays on both at once.

It is a framed picture rather than a stage: a white-to-pink sky with soft
blotches through it, a glow behind them, a vignette and film grain over the
top, and the two of them cropped at the thigh. Her: an auburn bob and a red
top. Him: a light blue collared shirt, mid-brown hair swept across, a mole on
his cheek. Faces are a few marks each — thick brows, a small nose, a mouth,
blush — and the eyes close into lashes for the hug, which is most of what
sells it.

Flat shapes, but not clip art. What keeps it from looking like clip art:

- **Two line weights.** Silhouettes take a 2.3 stroke, interior shapes (an ear,
  a collar, a hand) take 1.5. One weight everywhere is the giveaway.
- **One light source**, upper left: every fill is a diagonal two-stop gradient,
  with highlight shapes on the lit side and shade shapes on the other.
- **Shadows they cast on each other** — her head on his chest, his sleeve on
  her knit — blurred, and faded in only once they are actually touching.
- **Cloth and hair detail**: fold lines at the hems and along the sleeve, a
  placket and buttons down his shirt, strands of sheen through the hair.
- A soft drop shadow under the pair so they sit in the picture rather than on
  top of it.

Nothing here is a jointed rig. This close in, limbs that swing on hinges read
as machinery, so the whole thing is two drawings and a handful of transforms:

- **They start apart**, side by side, arms at their sides and eyes open — a
  photo of the two of them standing together.
- **They end up nested, not adjacent.** She translates further than he does and
  finishes inside his silhouette, her head under his chin. Two figures each
  keeping their own column is a side hug however far their heads lean, so
  closing a gap between them is not enough — one of them has to end up in
  front of the other.
- **The picture pushes in** on the moment they take hold: the pair scales up
  9%, and 11% at the squeeze.
- **The arms cross fade, and then they cross.** Arms-down seams fade out and
  the wrapped pair fades in: his sleeve sweeps down from his right shoulder to
  her far side, hers sweeps up from her left shoulder to his, and the two make
  an X across the middle. Each hand comes back into view past the far side of
  the other's body — that is what says they are holding each other rather than
  standing arm in arm. His sleeve is drawn last, so it passes in front of hers
  where they meet.
- **They face each other.** Both heads are drawn three-quarter with the nose on
  the silhouette — hers on the right, his on the left — so they are looking at
  each other rather than at the camera, apart as well as together.
- **Their heads tip toward each other** — he by 19°, she by 18° — and her head
  is drawn a little smaller than his.

The two of them stand at a believable difference in height rather than an
adult-and-child one, which took three things rather than one: she is raised in
both states, his chin and mouth ride higher in his face so they stay clear of
her as she comes up, and her hair is a flatter crown — a tall head of hair was
what covered his mouth every time she moved up, and flattening it bought the
room without shrinking her face.
- Then a squeeze, hearts up the empty side of the frame, a hold, and they let
  go in reverse order.

Two class names to avoid here, learned the hard way: `close` and `wrap` are
already used by the page (the stage's close button is a 42px square), and
putting either on the hug container collapsed the whole picture to 42×42. The
states are called `near` and `hold`.

## Watch party

Four steps: six titles alternating, a veto each, a countdown off the shared
clock, and then the screen itself.

**Screen sharing is peer to peer.** `getDisplayMedia` on one side, a
`RTCPeerConnection` between the two browsers, and the room's existing
WebSocket as the signalling channel — offers, answers and ICE candidates ride
as ephemeral `watch.rtc` events addressed to one peer id, so nothing about a
call is ever stored. Who is currently sharing lives in `watch.share`, which is
stored, and is cross-checked against the live peer list: a tab that closes
mid-share leaves the key behind, so the peer list is the truth.

The picture starts muted, which is the only way a browser will autoplay it —
sound is one press away, and that press is the gesture the autoplay policy
wants. Stopping, closing the stage, or hitting the browser's own stop button
all end the capture; the activity registers a teardown with `onClose` so a
screen share cannot outlive the page it was started from.

**The status line is sticky.** The panel repaints on a poll, and the first
version wrote failures straight into it — so every refusal, cancelled picker
and unsupported browser flashed for a second and a half and then vanished,
leaving a button that appeared to do nothing at all. Failures now live in a
variable the repaint reads from, and the message names the browser's own error
so a report of "it doesn't work" can be diagnosed. Browsers with no
`getDisplayMedia` are told before they press anything: the button is disabled
and says why.

Three things are worth knowing before you use it:

- **Netflix, Prime and Disney+ come through black.** Their copy protection
  blanks the frames before the browser can capture them. That is not something
  this page can work around, which is why the countdown is still there: it
  gets you both to press play on the same second instead.
- **Sound only comes with a tab**, not with a whole screen or a window, and
  only on Chrome or Edge.
- **A phone cannot share.** `getDisplayMedia` does not exist on iOS Safari or
  Android Chrome. Watching what the other one shares works fine on a phone.

There is no TURN server, so the two browsers have to reach each other over
STUN. That covers most home connections and fails on some mobile networks;
when it does, the panel says the connection would not hold rather than sitting
on a spinner.

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
