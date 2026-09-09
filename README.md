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

### Calling

Two buttons at the top of the chat: a handset for voice, a camera for video.
The call folds into the top of the chat panel rather than covering it, so the
thread stays there and you can type through it. A voice call is a band with
their initial in it; a video call is their picture with yours in the corner.
Under it: the other person's name and how long you have been on, then **Mute**,
**Camera off** and **Hang up**.

On the other side the chat opens itself, a chime repeats, and it offers
**Answer** or **Decline**. Declining says so in words on the caller's side
rather than just stopping. Nobody picking up gives up after 45 seconds, and a
call left ringing stops on its own after a minute — which is what covers the
caller closing their tab, since the room can be slow to notice a socket has
gone.

The call lives in the chat, not in an activity, so it keeps going while you
move between the hours of the day.

A video call with no camera on one side quietly becomes a voice call rather
than failing. A refused microphone says which permission to grant and where.
Mute and camera-off flip the track rather than renegotiating, so neither one
interrupts the call.

The connection itself is the same machinery as the screen share, and both now
use one helper (`NET` in `public/index.html`) — the relay lookup, the trick of
holding ICE candidates back until the description they belong to has gone out,
and the sentences explaining each way it can fail. If two browsers can share a
screen they can call, and if they cannot, both fail in the same way and say the
same thing. See **When they still can't reach each other** under Watch party.

**Not verified against real hardware.** There is no camera or microphone in the
sandbox this was built in, so the tests stand a canvas and an oscillator in for
`getUserMedia`. Everything downstream of that — the ringing, the negotiation
between two real browsers, the media actually arriving, the toggles, the
failure paths — runs for real in the suite.

## The arcade games


### An icon on every button

The page builds its buttons in forty different places and rewrites their
labels as it goes — "Start" becomes "Restart", "Sound on" becomes "Sound
off" — so an icon placed by hand at each call site is lost the first time the
text changes, because setting `textContent` takes the whole child with it.

`dressButtons` picks the mark from the words on the button instead, and a
`MutationObserver` catches buttons as new activities open. Add a button
anywhere and it gets its icon without anyone remembering to ask.

**The mark lives in `::after`, never `::before`.** Every button, card, input
and tile on this page draws its hand-drawn outline with an absolutely
positioned `::before` carrying a wobble filter, and the real border is forced
transparent underneath. Taking `::before` for the icon left the ghost buttons
with no outline at all — invisible on the paper — and dropped the mark
outside the pill, where the border used to be. Flex `order` pulls the
`::after` in front of the label instead.

The rule is also guarded by `@supports`: without masking, that `background`
line paints a solid block in the text colour rather than an icon. No mask,
no mark.

**The mark is painted, not parented.** It began as a child `<span>`, which
looked identical and was quietly wrong: whack-a-mole rewrites its label
eleven times a second, and every `textContent` assignment threw the child
away faster than the observer could put it back — a flicker you could see.
It is now the button's own `::before`, stencilled in `currentColor` through a
`mask-image` held in a custom property. A pseudo-element is not a child, so
nothing can rewrite it away, and the icon takes the button's text colour for
free.

**The mark suits the activity, not just the verb.** A spin on the roulette is
a wheel, a new wall in breakout is a wall, hangman's *Set it* is an A and a B,
the film quiz gets a film, and both *Skip* and *Neither, forfeit* get a flag.

Buttons with no letters in them are left alone — `+`, `−`, `→`, `✕`, the pad
arrows — along with rock, paper and scissors, which carry their own emoji.
The rule is *has letters*, not *is longer than two characters*: **Go** is two
characters and every bit a word, and the length rule silently stripped its
icon the moment whack-a-mole started a round.


### The five with moving parts

Pong, breakout, whack-a-mole, pac-man and doodle jump. Arcade cabinets are
built for one person, and this site is for two, which is the whole design
problem — a ball simulated on both screens is two different balls inside a
second. So there are two shapes here and no third.

**One ball, two chairs** — pong, breakout, whack-a-mole. The tab holding the
first seat (`ARC.drives()`, the same rule that counts a round of rock paper
scissors) runs the physics and broadcasts where everything is at 20Hz; the
other sends its controls up and dead-reckons between updates so the picture
stays smooth. Nobody else guesses at anything.

**One machine each, both lit** — pac-man and doodle jump. You play your own
and watch the other's, the way the snakes work: each side simulates itself
and publishes a compact frame ten times a second.

`ARC` holds what they share: a canvas at twice the pixels, a frame loop that
stops when you swap cabinets, held keys that ignore what you are typing into
the chat and clear on a tab switch, dragging and swiping, and a row of touch
buttons for phones with no arrow keys.

**Playing by finger.** Pong takes a drag up and down the glass, breakout a
drag across it, doodle jump a drag along the tower, and pac-man a swipe. The
first version had only the buttons, and the buttons only worked while held —
a tap is about thirty milliseconds, which moved a bat by nothing at all, so
the three hold-to-move games were unplayable on a phone. A short press is now
held for a beat.

**Who runs the physics** is claimed rather than assumed. It used to be the
first seat outright, which took for granted that the tab was awake and had the
cabinet open — a phone that locks its screen stops painting frames and the
other side's ball simply stopped. Each side now writes only that it is here,
in a key of its own, and both read both keys and apply the same rule.

One shared key was the obvious way to write that, and it does not work here:
**the room broadcasts a `set` to everyone except whoever sent it.** Two tabs
claiming the same key at the same moment each keep their own answer and never
find out they disagree — the server has one of them stored, but neither
learns which. Anything that needs two tabs to agree has to be written so they
never race for the same key.

**Two things that bit, both worth keeping in mind.**

Grid movement was written as "if you are within 0.06 of a cell centre, you may
turn". That works at sixty frames a second and stops working the moment one
frame runs long — the ghosts sailed straight past every junction and parked in
the first wall they met. Everything in the maze now lives on a cell plus a
fraction of the way to the next one, so a crossing cannot be missed however
long the frame took. There is a test that blocks the main thread for 450ms and
checks no ghost ends up inside a wall.

The first maze was drawn by hand and had a **sealed pocket** in the middle of
it. Both ghosts started inside, could never get out, and the seven pellets in
there with them meant the maze could never be cleared either. The one in the
file now is five corridors across and five down, so every open cell is on one
of them and it is connected by construction — and there is a test that floods
it from the player's start and fails if a single cell is unreachable.

### Rock paper scissors, actually in secret

"Both pick in secret" has to mean it, and the first version did not. It wrote
the throw straight into the shared room and left the hiding to the other
screen's CSS — the value was one `SYNC.get("rps.pick.her")` away from anyone
curious. Long before that, the live cursor gave it away outright: you could
watch a pointer drift onto **rock** and a click ripple land on it.

So: commit, then reveal.

- Pressing a button sets `rps.lock.<side>`, a flag saying *a choice was made*.
  The throw itself stays in the browser that made it.
- When both flags are up, each side publishes its own `rps.pick.<side>`.
  Neither can change by then: the buttons are disabled and the local throw is
  fixed.
- The round is counted by exactly one tab — whoever holds the first seat —
  guarded by `rps.round` against a repaint or a reconnect counting it twice.
- `CUR.mute` stops this browser broadcasting its pointer and its click ripple
  while the game is open, and lets go when you leave it.

Two things worth knowing about the state. The round moving on is what ends a
throw, not the button that moved it — only one of the two tabs pressed that,
and the other was left holding last round's hand until `render` learned to
compare `myRound` against `rps.round`. And a reload loses the local throw but
not the flag, so a side that is locked with nothing to publish gets its pick
handed back rather than stranding the round: nothing was revealed, so nothing
is lost.
Seventeen games, all shared — every move lands on both boards.

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

The room, and nothing else. One big screen with the two of you down the side:
who is here, and the chat — the same thread as the chat panel, text only, so
you can talk about the film without covering it. Under the screen is a source
bar: a YouTube link, or a screen share, then the house rules.

The shortlist, the picker and the countdown that used to sit under the room
are gone. They were three cards of ceremony in front of the thing you actually
came for. `CFG.watchRules` still feeds the house rules at the bottom of the
room card.

### Filling the screen

The button in the corner of the picture takes **the whole room** up, not just
the screen — so the chat in the rail comes with it and sits beside the film
rather than on top of it. It asks for real fullscreen and also styles itself
into place, so it works whether or not the browser grants it. Escape comes
back out of the picture rather than closing the activity, and leaving the
activity leaves the big picture behind.

An incoming call drops out of the big picture, because a real fullscreen hides
the chat panel whatever its z-index says — a call you cannot see is a call you
miss. The watch party listens for a `call:incoming` event on `window` that the
chat fires; the two never reference each other directly.

On a phone the chat is a sheet across the bottom, and at 80vh it buried the
picture completely. While something is playing, `body.watching` takes it down
to half the screen.

**One name to avoid here:** a local `const esc` for the Escape handler shadows
the global `esc()` that escapes HTML, and every name rendered on that screen
became "undefined". It is called `escKey`.

### YouTube, in step

Paste a link and it goes up on both screens. Whoever presses play, pauses or
scrubs moves it for both of you, because nobody sends "play" — the room stores
where the film was (`yt.at`) and when that was true by the shared clock
(`yt.since`), and each side works out for itself where it should be now. A tab
that was slow to load, or came back from a lock screen, computes the same
answer as everyone else and seeks to it rather than drifting. Corrections only
fire past 1.5 seconds of drift, so ordinary jitter doesn't make the picture
jump.

The player is YouTube's own iframe with its own controls, and its state changes
are what write to the room — so scrubbing the YouTube bar is the sync control,
rather than a separate set of buttons that has to be kept in agreement with it.

A caveat on this one: youtube.com is not reachable from the sandbox this was
built in, so the sync logic is tested against a stand-in player and the real
iframe API has not been exercised here. If it misbehaves, that is the first
place to look. The second person's browser may also refuse to autoplay with
sound until they touch the video once.


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

Two things had to be right before a real connection would ever complete, and
neither showed up on a loopback:

- **The offer goes out before any of its candidates.** Candidates start
  arriving during `setLocalDescription`, which is before the offer itself is
  signalled, so the first ones were reaching the far side ahead of the
  connection they belonged to. They are held behind the description now.
- **A viewer that is still connecting asks once, not every few seconds.** The
  repaint was re-sending `want`, and every one of them tore down a negotiation
  that was halfway through and started it again — so on any connection slower
  than a loopback it never finished, and the far side sat on "connecting"
  forever. The viewer now asks once per share and again only if the connection
  actually died; the sharer ignores a request from a peer it is already
  negotiating with.

### When the picture stutters

Four separate things read as "laggy", and they have four different answers.
The room asks the connection which one it is and says so under the screen,
rather than leaving you to guess. It only speaks up when something is
actually wrong.

What the sender does about it up front:

- **`contentHint = "motion"`** on the captured track. The default for a
  captured screen is *detail* — sharp text, frames dropped to pay for it.
  Right for a spreadsheet, wrong for a film, where it reads as constant
  stutter at the far end. This is the single biggest one.
- **`maxBitrate` of 8 Mbps.** A ceiling, not a target — the encoder stays well
  under it on a thin line. Set too low it is simply a quality cap, which is
  what the first attempt at 3 Mbps turned out to be.
- **The capture is capped**, because uncapped a 4K monitor is captured at full
  size and the encoder spends its whole budget on pixels that never reach the
  other end's window. Where the cap sits is the button below.

### Smoother or sharper

A connection can be spent on frames or on pixels, and which one you want
depends on what is on the screen. There is no right answer to pick for
someone, so it is a button in the source bar, next to **Sound on**:

| | contentHint | degradationPreference | capture |
|---|---|---|---|
| **Smoother picture** (default) | `motion` | `maintain-framerate` | 1080p30 |
| **Sharper picture** | `detail` | `maintain-resolution` | 1440p30 |

Smoother gives up detail when the line tightens, sharper gives up frames. All
three settings can be changed on a **live** connection — `contentHint` on the
track, `applyConstraints` for the capture size, `setParameters` for the sender
— so the button takes effect on the picture in front of you without
restarting the share or renegotiating. The choice is remembered per browser
and shapes the next capture. Only the person sharing sees it enabled.

The first version of this had no button and forced *smoother* on everyone.
That fixed the stutter and cost visible quality, which is the other half of
the same complaint.
- **The confetti pauses.** `GLITTER` repaints up to 120 bits across the whole
  window every frame, out of the same budget as decoding someone's screen.
  While anything is playing it stops, on both sides. It pauses rather than
  stops, so a browser set to reduced motion — which never started it — does
  not gain it here.

What it reads back, every four seconds:

- the selected candidate pair, for whether this is going **through the relay**
  and whether that relay is **over TCP**, which stutters however fast the line
  is — WebRTC only falls back to TCP when nothing else gets through;
- `qualityLimitationDurations` on the sending side, for **cpu** (share one tab,
  not the whole screen) against **bandwidth** (the upload can't carry it);
- `framesPerSecond` on the receiving side.

**One sample proves nothing.** Chrome reports `qualityLimitationReason:
"bandwidth"` for the first few seconds of *every* connection while it works
out how fast the line is — at a perfectly good frame rate. The first version
of this said the upload was failing on a loopback connection running at 31fps.
It now measures how much of the last stretch was *actually* spent held back
(a delta of `qualityLimitationDurations` over the interval, past 60%), and
wants two consecutive slow reads before it blames the frame rate.

### When they still can't reach each other

STUN only tells each side what its own public address is. Plenty of networks —
mobile data especially, and anything behind carrier-grade NAT — will not then
let two browsers connect to each other directly, and no amount of code fixes
that. The picture needs somewhere to bounce off: a TURN relay.

`GET /ice` hands the page short-lived credentials for one. Set two secrets and
it is on; leave them unset and the page falls back to STUN alone and says so
when a connection fails.

1. Cloudflare dashboard → **Realtime** → **TURN**, create a TURN key. Note the
   **Turn Token ID** and the **API token** — the token is shown once.
2. Add both as secrets on the Worker. Either in the dashboard, under
   **Workers & Pages → a-day → Settings → Variables and Secrets → Add**, as
   type *Secret*; or from a terminal with `npx wrangler secret put TURN_KEY_ID`
   and `npx wrangler secret put TURN_KEY_API_TOKEN`.

The names have to match exactly: `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`. They
take effect straight away — no redeploy. The panel tells the two cases apart:
*no relay set up* means the secrets are missing, and *the relay refused*, with
Cloudflare's own error, means they are there but wrong.

The API token never leaves the Worker; the browser only ever sees a credential
that expires in four hours. Cloudflare's free tier covers 1TB of relayed
traffic a month, which is far more than two people watching films.

Note that a relay carries the picture, so the screen share stops being purely
peer to peer when one is in use — WebRTC still encrypts it end to end, and
Cloudflare's own documentation is explicit that they relay without being able
to decrypt it, but it is worth knowing.

The panel says which stage it is stuck at: waiting for an answer, connecting,
connecting for suspiciously long, or failed. On a failure it distinguishes
three cases — no reflexive candidate at all (STUN itself unreachable, usually a
VPN or a locked-down network), reachable but no relay configured (with a
pointer to the steps above), and reachable with a relay and still nothing.

**Not verified here.** The sandbox this was built in cannot reach
`rtc.live.cloudflare.com`, so the credential call has never run for real. What
is tested is the endpoint's shape, the unconfigured fallback, the normalising
of Cloudflare's response into what `RTCPeerConnection` wants, and that
whatever `/ice` returns reaches the connection with its credentials intact.

## One song each

The 17:00 hour is a record shop. Type a song into any of the three boxes,
press one of the results, and it goes on for both of you at once — the same
clock trick as the video, so whoever presses pause pauses it on both sides and
a side that arrives late is dragged to where the song already is.

**Searching and playing are two different things, and only one of them
touches this Worker.**

Searching needs each service's secret, which must never reach a browser. Three
endpoints do the same job for the three shelves — `GET /spotify?q=…`, `GET
/youtube?q=…`, `GET /soundcloud?q=…`. Each asks its service for a token or
carries a key, caches what can be cached per isolate until a minute before it
lapses, and hands back only the handful of fields the page draws. `tidyTracks`,
`tidyTube` and `tidyCloud` throw away everything else, because the rest is
somebody's data for no reason.

Playing does not come through here at all. The page embeds each service's own
player, so **a pasted track link works with no keys set up anywhere**, and
each play is counted by whoever it belongs to.

### Three sources, one turntable

Spotify, YouTube Music and SoundCloud sit one under the other, each with its
own box, its own line of talk-back and its own list of results. Only one plays
at a time — putting a record on anywhere takes the other two off, and clears
every list, because three lists of records nobody put on is three chances to
wonder what is actually playing. The two dedication boxes that used to say who
was playing what are gone; the thing itself plays now, so naming it was doing
no work.

**Words search; a link goes straight on.** Every box takes both. Type and it
searches that service; paste a link it recognises and it skips the search
entirely, which is what you want when somebody has already sent you the song.
Paste a link it does *not* recognise — a Spotify link into the SoundCloud box
— and it says so, rather than searching for a URL, finding nothing, and
leaving you to blame the search.

A name picked out of a search is known before the player has loaded anything,
so the sleeve on the record reads right immediately instead of catching up a
second later. A pasted link has no such name and waits for the player to say.

YouTube here is the same deck the watch party uses. `TUNE` holds it once and
is pointed at whichever room keys the caller names — `yt.*` for the film,
`sy.*` for the song — so two decks never see each other and there is one copy
of the clock trick rather than two that can drift apart. It takes a watch
link, a share link, a shorts link, a **music.youtube.com** link, or the bare
eleven characters.

SoundCloud is the third, and the second one that hands a whole track to a
browser nobody has signed in. Its widget has a real API — `play`, `pause`,
`seekTo` and a progress event — which is the only reason it can join the
others: an embed you cannot drive is two people pressing play and hoping.
`CLOUD.url` cleans a pasted link down to the track and drops the tracking
tail, and accepts the `m.`, `on.` and `snd.sc` shapes as well as the plain
one. Its catalogue is strong on remixes, covers, live sets and anything
independent, and thin on major-label pop, so it complements YouTube rather
than replacing it.

**Which matters more than it sounds.** Spotify's embed only gives a browser
the whole song when Premium is signed in on that side. YouTube and SoundCloud
have no such catch, so for anyone without Premium those two shelves are not
the fallback — they are the way it works, and both of them can now be searched
from the page rather than hunted for in another tab.

**The ones deliberately left out.** Apple Music and Deezer embed thirty-second
previews without a paid account, which is the same wall in different paint.
Bandcamp plays in full but its embed has no control API, so it could never be
kept in step. Amazon Music has no embeddable player at all.

### The honest limit

What each of you hears depends on your own Spotify. Signed in with Premium in
that browser, the whole song. Otherwise, the thirty seconds the embed gives
anyone. There is no way around that from a web page — full playback needs
Spotify's own SDK and a Premium account per listener — and the note under the
record says so rather than pretending.

### Turning search on

Each shelf is independent. Set none of these and all three still work by
pasted link; set one and that shelf gains a search box that means it. Unset,
a shelf names the secret it wants and reminds you that pasting still works,
rather than failing quietly.

Every key below goes in the same place: **Workers & Pages → a-day → Settings
→ Variables and Secrets → Add**, type *Secret*. Then deploy.

**Spotify** — `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   → **Create app**. Any name; the redirect URI is not used by this and can be
   anything valid.
2. Open the app → **Settings** → copy the **Client ID**, then **View client
   secret**.

**YouTube Music** — `YOUTUBE_API_KEY`

1. [console.cloud.google.com](https://console.cloud.google.com) → a project,
   new or existing.
2. **APIs & Services → Library** → *YouTube Data API v3* → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Restrict
   it to the YouTube Data API while you are there; it is read-only either way,
   but a key that can only do one thing is a key worth less if it leaks.

Free, and the daily allowance is 10,000 units. A search costs 100, so that is
100 searches a day — for two people, an allowance you will not notice.

The results are narrowed twice before they reach the page: to the **Music**
category, and to **embeddable** videos only. The second matters more than it
sounds — an unembeddable video looks perfectly normal in a list and then
refuses to load in the player. If the Music category comes back with nothing
the search runs again without it, because a great deal of music is filed under
nothing in particular.

**SoundCloud** — `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET`

1. [soundcloud.com/you/apps](https://soundcloud.com/you/apps) → register an
   app, or use their API request form if registration is closed to you.
2. Copy the **Client ID** and **Client Secret**.

Be warned: SoundCloud has kept new app registration shut for long stretches
and there is no promise you will be granted keys. That is why the SoundCloud
shelf was built to work by pasted link first and gain search second — if the
keys never come, nothing here stops working. Search results carry the track's
own link rather than an id, because the widget wants a page, not a number, and
a track their API marks **blocked** is dropped before you can pick it and be
refused. One marked preview-only is kept, and says so.

### Keeping it in step without the sawtooth

Correcting once a second was the lag rather than the cure. A seek takes a
moment to bite, the player keeps reporting where it used to be, so the next
tick seeks again — a stutter you can hear. It now nudges at most once every
six seconds, only past three seconds of drift, with a beat of lead for the
seek itself, and it leaves a freshly loaded track alone for four seconds.

Falling behind is not one problem, and the two need opposite answers, so the
useful question is whether the player **moved** since the last look.

- Moving but late — drift. Nudge it and say nothing.
- Not moving, and paused — the browser is refusing to start. Nothing here
  can fix that: a browser will not begin sound on its own, so it asks for one
  press of play on that side.
- Not moving, and playing — it has run out. That is Spotify's thirty-second
  sample, all it gives a browser that is not signed in, and no amount of
  dragging will carry it further.

Our own nudge is not the player moving. Counting it as movement reset the
stall count every time a correction landed, which kept a dead player looking
merely late — so a seek sets the last-seen position to where it was aimed.

**Not verified here.** `api.spotify.com`, `accounts.spotify.com`,
`open.spotify.com`, `googleapis.com`, `youtube.com`, `api.soundcloud.com` and
`soundcloud.com` are all unreachable from the sandbox this was built in, so no
token call and no real embed has ever run from here — though Spotify search
has since been confirmed working against the live Worker, and the page has
been checked against a real eight-track response.

What *is* tested, and against what: the three endpoints' shapes and their
unconfigured messages, live, against the running Worker. The tidying of all
three services' answers — `tidyTracks`, `tidyTube`, `tidyCloud` — against
copies of what each really sends, including YouTube's HTML-escaped titles,
its non-video results, SoundCloud's blocked and preview-only tracks, and a
missing thumbnail on each. And the whole of the page's behaviour — searching,
drawing results, picking one, a pasted link skipping the search, a foreign
link being refused, one source taking the others off, and the full sync of
play, pause and a late arrival being seeked — against stand-in players, from
two browsers at once.

The gap is the same one as before, and worth naming plainly: the calls to
Google and SoundCloud themselves have not run. If a key is right and the
answer still does not come, the shelf will say what the service said.

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
