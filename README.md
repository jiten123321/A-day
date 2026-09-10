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

### Snakes and ladders

A hundred squares numbered the way a real board is: left to right along the
bottom row, right to left along the next, and so on up — so square 1 is
bottom-left and 100 is top-left. Everything else is looked up from that one
rule rather than worked out twice: `SL.cell(n)` turns a number into a place on
the board, and both the tokens and the drawing use it.

The snakes and the ladders are drawn as one SVG over the grid rather than
placed square by square. A ladder is two rails offset either side of the line
between its feet, with rungs at even intervals along it. Both are drawn in a
10×10 space, so they land on the squares whatever size the board is.

**A snake is a shape, not a line.** The first attempt was a curve with a circle
on the end of it, which is a diagram of a snake. An SVG stroke cannot taper, so
the body is a filled outline instead: sample a curve that bends one way and
then the other, step out either side of it by a width that thins from the neck
to the tail, and come back along the other side. Bands across the back, a jaw
turned to face the way it is going, eyes with pupils, and a forked tongue.

Nine ladders and ten snakes, the classic set. A six rolls again, the way the
ludo board next door does, so the two of them agree about dice. You need the
exact number to land on a hundred — anything over and you stay where you are,
and the board says how many you needed.

One trap worth naming: the squares are `.slsq`, not `.sq`. Chess already owns
a **bare** `.sq` rule further down the file, and a second board using the same
name would have quietly inherited it.

### Four more, in the shape of four everybody knows

Best of three, Up the girders, Hold the line and Back to back — a one-on-one
fight, a climb up girders away from barrels, a run and gun, and a walk down a
street with your fists.

**They are not the machines they are shaped like.** Double Dragon, Donkey Kong,
Contra and Street Fighter II — the names, the characters and the artwork —
belong to the people who made them, and none of that is here. What is here is
the *kind* of game, drawn from nothing in this page's own hand.

Three of the four are the "one ball, two chairs" shape and share their wiring,
which is written once in `ARC.crew`: each side posts what it is holding down,
one side runs the world and posts the world back. Written out three times it
would have been three chances to get the echo rules wrong.

**And the people in them are drawn once too.** The first pass gave every one of
them a rounded box with a ball on top, which is a place-holder rather than a
character. `FIG.draw` is a jointed figure: a head that faces where it is going,
a neck, shoulders wider than the waist, arms that bend at the elbow, legs that
bend at the knee, hands and feet. Every part is placed by an angle, so a punch,
a guard, a climb, a walk and a fall are the same drawing with different numbers
— and the far arm and leg are drawn first, in a darker shade of the same
colour, so the body reads as having two sides.

Everything is drawn facing right and flipped by the canvas, which keeps the
pose tables readable: **out in front is always zero degrees.** A fighter's
whole vocabulary is five lines of them.

Two things it took two goes to get right. The hair closed its path across the
face and filled the lot, so every one of them stood there looking away from
you; it is a cap arc plus a tuft down the back now. And the guard had the
fists above the head rather than at the chin, which is a surrender rather than
a stance.

**Two silhouettes, not one.** The first pass drew everybody the same way,
which made the whole arcade two men. `she` gives the figure narrower
shoulders, a waist that comes in and hips that go back out, a fringe swept
across, and long hair — and that hair is drawn *before* the body, because hair
falls behind shoulders. Everything else is shared: the same limbs, the same
pose tables, the same walk. Her side of every one of the four is hers now, and
the crowd in the street and on the line is not all men either.

**The world goes out twenty times a second, not sixty.** It is posted from
inside the frame loop, so without a throttle that is sixty messages a second
down one socket for a game nobody can see moving that fast. Pong has always
used twenty; so do these.

**Best of three** is the fight. Punch is short and quick, kick is longer and
slower, block takes a third of what a face takes. **Space throws the punch**,
the same key that fires and swings in the other two — one hand on the arrows,
one thumb on the bar, and nothing to remember. A swing lands once, at the
moment it is fully out, rather than every frame it overlaps. Three rounds of
forty-five seconds; whoever has more health when the clock runs out takes the
round.

**Up the girders** is the odd one out: one tower each, both live, the shape
pac-man and doodle jump use. Five girders sloped alternately, a ladder at each
high end, barrels released from the top that roll downhill and drop to the next
girder when they run out of girder. Three lives. The foot of a ladder is
sixteen pixels wide either side rather than twelve, because on a board a
hundred and ninety across, twelve is a pixel you have to find rather than a
place you can stand.

**Hold the line** is the run and gun. Ten waves, both of you on one line,
shooting the way you are facing. They shoot back, and walking into one costs
you as much as being shot.

**Back to back** is the street. It has depth — up and down the street as well
as along it — and everything is drawn back to front by how far up the street it
is, so whoever is nearest is in front. They close on whichever of you is
nearer, which is what makes standing together worth doing.

### The cabinet, and filling the screen

The game panel now sits inside a cabinet with the same button the watch party
uses. It wraps the panel rather than living inside it, because the panel is
emptied and rebuilt every time you change game and would throw the button away
with it.

Filling the screen is one person's choice about their own eyes, so unlike
almost everything else here it is **not** shared. Esc leaves the big cabinet
rather than the whole arcade, and the browser's own exit is followed.

A bigger cabinet is only bigger if what is in it grows too, so every board that
caps its own width is let out in `.arcstage.wide` — sized off the viewport
*height*, because on a wide screen that is what runs out first.

### Three, two, one

Pressing play used to start the round in the same instant, which is fine alone
and rude with two people: one of you is already playing before the other has
looked up. Whoever presses writes the moment the round begins; both sides count
down to that moment off the shared clock, so the numbers land together however
far apart you are.

**Only the presser starts it.** Every one of these games already knows how to
tell the other side — `drives() ? start() : SYNC.ev("mole.go")` — and running
that on both sides would start the round twice.

**And only the presser clears the count.** Clearing it from both sides is a
race, and it lost: whichever clock ran a hair ahead wiped the shared key first,
and the side that was supposed to start the round found nothing there and
started nothing. The other side needs no clearing at all — a moment that has
passed paints as no countdown. There is a test that presses on one side and
checks the round is running on both a moment after the three is up.

A second, nervous press during a countdown does nothing rather than restarting
it. A count left behind by a tab that closed mid-three is not a countdown, and
does not block the next one.

Six games take it: pong, breakout, whack-a-mole, pac-man, doodle jump and
snake. The board games do not — nobody needs counting in before a chess move.

### Whack-a-mole, out of the ground

It began as a mouse emoji sliding up inside a flat grey circle, which is a
diagram of whack-a-mole rather than the thing itself. It is now nine mounds of
earth with holes dug into them, and the mole comes up out of one.

**The realism is entirely drawing order**, repeated everywhere else it is
needed:

1. the mound, then the dark pit inside it;
2. the mole;
3. the front of the mound, painted over the mole;
4. its paws, painted over that.

So it emerges from behind the earth and grips the rim, instead of sliding
across a circle. Two things had to be got right for that to hold:

The occluder is **fill only, no stroke**. A closed path draws its own straight
closing edge, and stroking it laid a hard line across the middle of every
mound — nine mushrooms rather than nine holes.

The clip that keeps a resting mole underground sits on a **parent group that
does not move**. Put on the mole itself, it travels with the mole's own
transform and clips nothing at all: every mole sat parked below its mound in
plain sight. There is a test that reads the paint order and checks the clip's
owner is still.

**What it plays like now.** It gets harder as the thirty seconds run down —
sooner, and gone quicker, so the last ten seconds are the ones worth winning.
Roughly one in nine is golden, worth three and gone sooner still. A hit
squashes the mole, crosses its eyes, throws up dirt, flashes a ring in the
colour of whoever got there and knocks — a short burst of noise through a low
band, so it lands like wood on wood rather than ringing like a message.

**Whacking bare earth costs you a third of a second.** Without that, the
winning strategy is to hammer all nine holes as fast as your hand allows,
which is not a game. The stun is held by the same side that runs the round, so
it cannot be shrugged off by the tab that did the flailing.

On a desktop the pointer becomes a mallet that swings where it lands. Only
where there is a real pointer to replace: `(hover:hover) and (pointer:fine)`,
so a phone keeps its own tap.

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
Twenty-two games, all shared — every move lands on both boards.

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

## The way in

The gate asks who is there before anything else, so the day knows which side of
it you are on. Names come from `CFG.her` and `CFG.you` — and from `CFG.herAlso`
and `CFG.youAlso`, which is the list of other things either of you might
actually type. Without those, typing a real name instead of the pet name in
`CFG` lands you on the page as a stranger — *someone else's day, but stay* —
which is a cold thing to be told by your own present. Case does not matter.

**Two roses, for her.** When the name is hers, the gate does not lift straight
away: two roses draw themselves, the heads open one after the other, a ribbon
ties them, a few petals let go, and the whole thing says *For you, Ladoo.* —
`CFG.her`, the name he calls her, rather than whatever she typed to get in.
Four seconds later the day opens on its own. Nothing waits for a press —
there is nothing to press.

The four seconds are not idle. `SYNC.connect()` is called the moment the name
is known, so the room is joined while she is still looking at them and the page
behind is ready by the time it shows.

Everyone else — him, or anybody who was sent the link — goes straight in, which
is the point: it is a thing given to one person, not a splash screen.

A note on how it is drawn, because it caught me out. Each falling petal is
placed by a `transform` attribute on a wrapping `<g>`, never on the petal
itself. A CSS `transform` in a keyframe *replaces* the element's own transform
attribute rather than composing with it, so animating the petal directly threw
every one of them back to the origin and they fell from the corner of the
drawing in a neat stack. The wrapper holds the place; the animation only ever
touches the child. There is a test that measures how far each petal starts
from a rose, so it cannot come back.

For `prefers-reduced-motion`, the roses are still given — drawn, tied and
named — with nothing moving, and the four seconds stand.

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

Search it or paste a link and it goes up on both screens. Whoever presses play, pauses or
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

**The same search as the record shop, asking for a different thing.** `SEEK`
holds all of it once — a box that takes words or a link, a link skipping the
search, a link from somewhere else refused by name rather than searched for —
and the two callers differ by a single word. The record shop asks
`kind=music`; the room asks `kind=any`, because narrowing a film search to the
Music category would hide the film it went looking for. Everything else,
including embeddable-only, is the same on both.

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

The 17:00 hour is a record shop. Type a song, press one of the results, and it
goes on for both of you at once — the same clock trick as the video, so
whoever presses pause pauses it on both sides and a side that arrives late is
dragged to where the song already is.

**One box that takes both.** Words search YouTube Music. A link it recognises
skips the search and goes straight on, which is what you want when somebody
has already sent you the song. It takes a watch link, a share link, a shorts
link, a **music.youtube.com** link, or the bare eleven characters. A link it
does *not* recognise is refused by name — searching for a URL finds nothing
and then looks like the search is the thing that is broken.

**Searching and playing are two different things, and only one of them
touches this Worker.**

Searching needs a key, and a key in a page is a key anybody can spend, so it
stays here. `GET /youtube?q=…` asks the YouTube Data API and hands back only
the four fields the page draws; `tidyTube` throws away everything else,
because the rest is somebody's data for no reason. It also unpicks their
HTML-escaped titles, since the page escapes again on the way to the screen
and an apostrophe would otherwise arrive as `&#39;` and stay that way.

Playing does not come through here at all. The page embeds YouTube's own
player, so **a pasted link works with no key set up anywhere**, and the play
is counted by YouTube.

The deck itself is the one the watch party uses. `TUNE` holds it once and is
pointed at whichever room keys the caller names — `yt.*` for the film, `sy.*`
for the song — so two decks never see each other and there is one copy of the
clock trick rather than two that can drift apart.

A name picked out of a search is known before the player has loaded anything,
so the sleeve on the record reads right immediately instead of catching up a
second later. A pasted link has no such name and waits for the player to say.

### Sound, not picture

Nobody watches a song. The player is here for what comes out of it, so what
you get in the card is the record turning and four bars moving, and no video
at all.

That is not a matter of hiding the player. A `display:none` iframe is a
*paused* iframe in more than one browser, so it is not hidden: it is rendered,
one pixel across, in the corner of the page, and quietly playing. `.radio-cage`
is that pixel.

With no picture there is no transport either, so the page puts its own back —
**Both press play** / **Pause it for both**, and **Take it off**. A press
writes where the song is and that it is running, exactly as pressing play
inside the player used to, so one side pressing still moves the other.

### It keeps playing when you walk away

The player belongs to the page, not to the 17:00 card. Wandering off to a game
or a film does not lift the needle: the song goes until somebody takes it off.

`RADIO` owns it — one deck, one hidden host, one heartbeat a second that paints
and syncs whatever the room says is on. The card borrows it and hands it back;
closing the card drops nothing.

Once the hour is closed a small bar appears in the corner with the bars moving,
the name of what is on, a play and a stop. It sits *above* the cinema on
purpose: a song you cannot reach to stop is worse than a small bar in the
corner of a film. It hides again while the hour is open, because the card is
already saying all of it.

A tab that arrives late — a reload, the other phone picking up — finds the song
already going and joins it, because `RADIO` boots with the page rather than
with the hour.

### When a browser will not make a sound

No browser starts audio for someone who has not pressed anything, and there is
no arguing with that. So if the room says the song is running and this side's
player is not, after a second of disagreement the bar stops pretending: the
bars go still and it reads **tap to hear it**. One press is all it wants, and
the same press is the gesture the browser was holding out for.

This is why the play button is worth having even though the two sides stay in
step on their own. It is not a second opinion about when the song should run —
it is the only way to answer a browser.

### It was three shops once

Spotify and SoundCloud sat here too, and both are gone.

Spotify's embed hands a browser thirty seconds unless Premium is signed in on
*that* side. There is no way around it from a web page — full playback needs
Spotify's own SDK and a Premium account per listener — so what it mostly did
was start a song and then stop in the middle of it, which is worse than not
offering the song at all.

SoundCloud plays in full and its widget can be driven, so it was a fair
second. But its catalogue is thin exactly where this hour is not — major-label
pop, film songs — and its app registration has been shut for long stretches,
so the search half might never have been switched on at all.

One shop that works every time beats three you have to choose between, and
choosing was itself work: three boxes, three lists, and a rule about which one
wins. Apple Music and Deezer were never candidates — thirty-second previews,
the same wall in different paint. Bandcamp plays in full but its embed has no
control API, so it could never be kept in step. Amazon Music has no embeddable
player at all.

### Turning search on

Without a key everything still works by pasted link, and the box says which
key is missing rather than failing quietly. With one, it searches.

1. [console.cloud.google.com](https://console.cloud.google.com) → a project,
   new or existing.
2. **APIs & Services → Library** → *YouTube Data API v3* → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Restrict
   it to the YouTube Data API while you are there; it is read-only either way,
   but a key that can only do one thing is a key worth less if it leaks.
4. Add it as a secret on the Worker, exactly as with TURN: **Workers & Pages →
   a-day → Settings → Variables and Secrets → Add**, type *Secret*, named
   `YOUTUBE_API_KEY`. Deploy.

Free, and the daily allowance is 10,000 units. A search costs 100, so that is
100 searches a day — for two people, an allowance you will not notice.

The results are narrowed before they reach the page. **Embeddable videos only,
always** — that matters more than it sounds, because an unembeddable video
looks perfectly normal in a list and then refuses to load in the player.

The **Music** category is asked for by the caller, since the two places that
search want different things: `kind=music` from the record shop, `kind=any`
from the watch party, which is looking for a film and would rather not have it
filed away. Where Music is asked for and comes back with nothing, the search
runs again without it, because a great deal of music is filed under nothing in
particular.

The same key serves both, so turning search on turns it on in both places at
once.

To check the key landed, open `https://<your-worker>/youtube?q=test`.
`{"ok":false,"why":"unset"}` means the Worker cannot see it — the secret is
missing, or it was added but not deployed. `{"ok":false,"why":"keys"}` means
Google refused it, usually because the YouTube Data API is not enabled on that
project. A list of tracks means it is working.

### Keeping it in step

The correction is deliberately lazy, because eager correction *is* the
stutter: a seek takes a moment to bite, the player keeps reporting where it
used to be, and the next tick seeks again. It nudges only past a second and a
half of drift, and holds off for a beat afterwards so its own seek is not
mistaken for the player drifting again.

**Not verified here.** `googleapis.com` and `youtube.com` are both unreachable
from the sandbox this was built in, so the call to Google has never run from
here. What is tested is everything either side of it: the endpoint's shape and
its unconfigured message against the running Worker; `tidyTube` against a copy
of what YouTube really sends, including escaped titles, non-video results and
a missing thumbnail; and the whole of the page — searching, drawing results,
picking one, a pasted link skipping the search, a foreign link being refused,
the clock, a late arrival being seeked, the song surviving the hour closing,
the corner bar's play and stop reaching the other side, a tab arriving late
joining a song already on, and a browser refusing to make a sound being
answered — from two browsers at once against a stand-in player. If the key is
right and the answer still does not come, the box will say what Google said.

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
