Yep—there are a couple “cheap” ways to get most of the canvas benefit for 10 Claude Code shells without building a whole new terminal.

Tier 0: no-code “spatial enough”
A) One big terminal + tmux + a map

If your pain is tracking 10 instances, tmux wins fast:

1 tmux session = “canvas”

10 panes = 10 Claude Code instances

give each pane a name + status line so you never lose context

Key trick: make panes semantic (top-left = repo A, etc.) and never rearrange—spatial memory kicks in.

Minimal setup:

tmux new -s claude

# split into a grid quickly

tmux split-window -h
tmux split-window -v
tmux select-pane -t 0 \; split-window -v
tmux select-layout tiled

Then in each pane: run claude (or whatever you launch).

Add pane labels (big win):

tmux set -g pane-border-status top
tmux set -g pane-border-format " #{pane_index} #{pane_title} "

# rename with: Ctrl-b ,

If you do nothing else: this already makes “10 instances” manageable.

B) Same idea but better UI: WezTerm + tab “workspace”

WezTerm panes are smoother than a lot of terminals, and you can bind “jump to pane N” keys. It’s still a grid, but fast.

Tier 1: “fake canvas” using OS-level floating windows (surprisingly good)

You can treat each Claude Code instance as a floating terminal window and then use a tiler to place them in a consistent 2D arrangement, plus a quick “overview”.

macOS: yabai (float + move/resize windows via hotkeys)

Linux: i3/sway (floating + scratchpad), or GNOME extensions

Windows: FancyZones (PowerToys) + hotkeys

This gives you:

real 2D space

“that one is over there”

fast switching via keybindings

Even without “infinite” canvas, it feels like one.

Tier 2: the easiest actual “canvas prototype” you can build in a weekend

Build a tiny app that:

shows an infinite pannable canvas

each node is a terminal view backed by a PTY

drag nodes around, zoom, and click-to-focus

The hack stack

Tauri (or Electron) app shell

xterm.js for terminal rendering

node-pty (Electron) or a Rust PTY crate (Tauri) to spawn shells

store node positions in a JSON file

Conceptually:

each “card” = {id, cwd, command, x, y, w, h}

spawn claude inside each PTY

route keyboard to the focused card

canvas pan/zoom transforms the cards

That’s it. You don’t need tiling logic at all.

If you tell me your OS, I’ll give you the fastest concrete path (Electron+node-pty vs Tauri+Rust PTY) and a minimal repo skeleton.

Tier 0.5: a super-cheap improvement specifically for Claude Code

If Claude Code instances are “task threads”, then the real win is a persistent label + state per instance.

Do this even if you don’t change layout:

prefix prompt with a name (project / goal)

keep a “pinned note” per instance (what it’s doing, next action)

In tmux, set titles automatically per pane via a small wrapper:

# run: cc "label" [args...]

cc () {
tmux select-pane -T "$1"
  shift
  claude "$@"
}

What I’d do if I were optimizing for speed tomorrow

tmux grid + pane titles + a couple bindings (jump to pane, next/prev)

optionally split into 2 tmux windows: “active” (4 panes) + “background” (6 panes)

if you still want spatial freeform: OS floating windows via yabai/i3/FancyZones

Tell me:

OS (mac/windows/linux)

are these 10 instances across different repos or same repo different tasks?

do you want mouse drag or keyboard-only?

…and I’ll give you the tightest setup + config snippet for that environment.

A pty is a pseudo-terminal.

Concretely: it’s the OS object that makes a program think it’s talking to a real terminal (keyboard + screen), even though it isn’t.

The mental model (correct, minimal)
[ your app ] ⇄ [ PTY slave ] ⇄ [ shell / claude / vim ]
↑
PTY master

PTY slave
What the program sees as “the terminal”

PTY master
What you (or another program) read/write to

When you type in a terminal emulator, you’re writing to the master.
When the program prints output, it comes back through the master.

Why this exists

Programs like:

shells

vim, htop

REPLs

Claude Code

change behavior if they detect a terminal:

colors

cursor movement

full-screen UIs

line editing

signals (Ctrl-C, Ctrl-Z)

Pipes (|) and simple stdio are not enough.
PTYs preserve interactive terminal semantics.

Why PTYs matter for your idea

If you want:

“each canvas node is a live terminal running Claude Code”

you must use a PTY.

Without a PTY:

Claude thinks it’s non-interactive

no colors / no TUI

broken input handling

often refuses to run properly

That’s why tools like:

tmux

screen

terminal emulators

VS Code terminal

Warp

all sit on top of PTYs.

Concrete examples
tmux

tmux allocates a PTY per pane

shells attach to PTY slaves

tmux reads/writes PTY masters

Electron / canvas terminal

node-pty creates a PTY

xterm.js renders output

keyboard → PTY master

SSH

ssh -t explicitly allocates a PTY on the remote machine

What a PTY is not

not a GUI thing

not a window

not a shell itself

not a pipe

It’s a kernel-level terminal illusion.

One sentence definition

A PTY is a kernel abstraction that lets one program pretend to be a real terminal for another program.

If you want the next layer

We can go into:

how PTYs relate to termios

how resizing works (SIGWINCH)

why full-screen TUIs need them

or the minimal PTY code to spawn Claude Code

But at your level:
“PTY = the thing that makes interactive terminals possible.”

Yes — that’s basically the hack: spawn a PTY per Claude instance, pipe its bytes into your renderer, send keystrokes back. That’s what every terminal emulator does.
But two important gotchas:

1. It’s not “just text”
   Most terminal output is a stream of bytes that includes ANSI escape sequences (cursor moves, colors, clears, alt screen, etc.). Claude Code (and a lot of TUIs) will use these.
   So you don’t render a “text chain”; you implement a terminal state machine (screen buffer + cursor + styles).
   Easy path: don’t implement it—use xterm.js (web) or a native terminal widget. They already parse ANSI and maintain the buffer.
2. You also need “terminal control” plumbing
   At minimum:

resize events → set PTY cols/rows (or TUIs break)

Ctrl-C / Ctrl-D / Ctrl-Z → signals / control chars

focus model → only focused node gets keystrokes

scrollback → buffer management

Again: xterm.js handles most of the rendering + buffer; the PTY lib handles the process.

Minimal architecture for your “canvas terminal”
Per node:

pty = spawn(shell or claude, cols, rows, cwd, env)

xterm = new Terminal({cols, rows})

pty.onData(data) => xterm.write(data)

xterm.onData(keys) => pty.write(keys)

on resize: pty.resize(cols, rows) + xterm.resize(cols, rows)

Canvas layer:

stores {x,y,w,h, z, title, cwd, command}

pan/zoom transforms nodes

click node → focus → route keyboard

Persistence:

save node graph to JSON

on launch: recreate PTYs + positions

That is enough to manage 10 Claude Code instances.

Caveats you should know up front

Zooming: terminals don’t “scale”; you’ll either scale the canvas visually (blurry) or change font size + recompute cols/rows (better, harder).

Performance: 10 xterm.js instances can be fine, but you want to throttle rendering when offscreen.

Security: you’re effectively building a shell host; be careful with remote content / clipboard.

Fastest path by platform

If you’re OK with Electron/Tauri:
Electron + node-pty + xterm.js is the shortest line to “it works”.

If you want more native / smaller:
Tauri + Rust PTY + xterm.js still uses xterm.js for rendering.

If you tell me macOS vs Linux vs Windows, I’ll give you the exact minimal stack + skeleton and the 20 lines that wire PTY ↔ xterm, plus the canvas layout piece.
