# Design rules

Conventions this library's panes follow. They are not style preferences — each
one is here because the alternative was tried and produced a bug or a screen
nobody could read. Follow them so two panes built a year apart still look like
one product.

Reference implementations: `GrantsReviewPanel.vue`, `GrantsExplorer.vue`,
`TagDefinitionManager.vue`.

---

## Layout

**A pane is a picker column and a content column.** The left column holds
filters and, where there is one, the tree or list that selects what the content
is about. The right column holds the answer. Nothing that narrows or selects
belongs across the top of the content — a band of chrome above the table costs
the same height on every screen and reads as page furniture rather than as part
of the pane.

**Narrowing is picking.** Filters live in the picker column with the tree, not
in the content toolbar. The content toolbar is for what acts on the content.

**No more than one picker column visible at a time.** If a host already supplies
one, the pane does not add a second. Two adjacent trees are indistinguishable
however they are labelled.

**Actions on the pane's object go on the line that names it.** Granting, bulk
revoking and anything else addressing the object as a whole belong on its
identity row, next to each other — not in the table's toolbar, where they read
as acting on the current selection or on a row.

**A fullscreen dialog is a pane and takes the same shape.** Filters in a folding
column on the left; on the right, a header row that survives the fold, then the
content. A dialog that stacks its filters above its result makes the reader
scroll past every control on each open to reach what they came for, and puts any
summary of those filters directly beneath the controls it summarises — the same
thing said twice, one after the other.

The full shape, which is what every pane and dialog here composes to:

```
┌─ picker column (folds) ─┬─ header row: identity / summary + fold toggle ─┐
│ filters                 ├───────────────────────────────────────────────┤
│ tree or list            │ notices, verdicts                             │
│ (scrolls on its own)    │ table — bounded, fixed header, own scrollbar  │
│                         │ what confirms or acts                         │
└─────────────────────────┴───────────────────────────────────────────────┘
        the whole bounded to the viewport; nothing outside it scrolls
```

---

## Folding

**The fold control lives with the content it uncovers**, at the top of the
content column, not above the column it folds. That is where a reader looks
after the column has disappeared.

**Fold by animating width to zero, never by unmounting.** Keep the contents at
their own fixed width inside a wrapper whose width transitions over 200ms with
`overflow: hidden`. Unmounting reflows the contents on the way out and makes the
content column jump rather than grow. It also throws away scroll position and
any state the column held.

```css
.x-fold {
  width: 300px;
  overflow: hidden;
  transition: width 0.2s ease;
}
.x-fold--out {
  width: 0;
}
@media (prefers-reduced-motion: reduce) {
  .x-fold {
    transition: none;
  }
}
```

Honour `prefers-reduced-motion`, and switch the transition off while a divider
is being dragged — a width transition makes the pointer and the edge disagree.

**Label a fold with a noun, never a verb.** `Filters`, `Scope`,
`Filters & hierarchy`. The icon carries the direction and the tooltip carries
Show/Hide. The noun names what is behind the fold and stays true in both states.

**Name it for what is actually behind it.** `Scope` rather than `Resources`,
where the column picks a server, a project, an object, a tag or a principal and
only one of those is a resource.

---

## Icons

**One glyph, one gesture.** Reusing a glyph makes a pane look as though it has
one control twice.

The pair says what the column does for the answer beside it, not which component
it belongs to — so a reader learns it once and it holds everywhere. **Inputs**
decide what the answer covers: filter controls, a principal picker, a resource
tree feeding a query. **Destinations** are places to move between, where the
answer changes because you went somewhere else.

| Gesture                           | Icon                                                   |
| --------------------------------- | ------------------------------------------------------ |
| App navigation drawer             | `mdi-menu` — reserved for the shell                    |
| Fold a column of **inputs**       | `mdi-arrow-collapse-left` / `mdi-arrow-expand-right`   |
| Fold a column of **destinations** | `mdi-chevron-double-left` / `mdi-chevron-double-right` |
| Disclose a section in place       | `mdi-chevron-up` / `mdi-chevron-down`                  |

A column of inputs is labelled `Filters` whatever it holds — the grants review's
`Filters & hierarchy` and Resolve Entities' principal-and-resource column are
both filters on the answer beside them, and naming one of them something else
made two identical columns look like two different kinds of thing. A column of
destinations is labelled for what it lists: `Scope`.

**A list of unlike things takes no label.** Where the entries are not one kind
of thing — the Cedar rail holds policies you edit, sources and a schema you
read, and a resolver you run — every collective noun is untrue of some of them,
and inventing one to cover the set ("Sections", "Views") describes the furniture
rather than the contents. Leave the fold as its icon and tooltip. It is also
the right call wherever a pane title sits beside the control and already says
where you are; a label there competes with a heading inches away. `Filters` and
`Scope` keep theirs because each names a set that really is one kind of thing,
and each sits alone on its row.

**Accent the glyph, not the label.** `color="secondary"` on the icon makes a
control findable among plain text without it reading as the pane's primary
action. Primary is for the action, not for the furniture.

---

## Sections

**A section heading is its own control.** Make the whole row clickable rather
than adding a separate button next to a label that already says what it opens.
The leading glyph carries the direction; a second arrow at the other end says
the same thing twice. Buttons inside the row need `@click.stop` so clearing a
filter does not also collapse the panel it just cleared.

**Two values get a toggle, not a select.** A dropdown costs a click to reveal a
choice that fits on one line, and the same question asked twice in an app should
look the same both times.

**Show what is set while collapsed.** A badge with the count of active filters,
and a `Clear`, both only when something is actually set.

**A pane inside a named tab does not repeat the tab's name.** Its actions go on
the row with the fold, not in a header band of their own — a title that echoes
the navigation above it costs the same height on every screen and says nothing.

**Skip the tooltip when the row already says it.** A tooltip on a heading covers
the first control beneath it, which is the one the reader is reaching for.

---

## Height and scrolling

The app shell pins `body`, so nothing scrolls unless a pane says it does. One
rule decides every height here, and three things have to hold for it to work.

**The rule: a pane ends at the viewport, less the app footer, less one gap —
measured from its own top edge.**

```ts
const top = el.getBoundingClientRect().top;
height.value = `${Math.max(MIN, Math.round(window.innerHeight - footer - top - 24))}px`;
```

Not `calc(100vh - 240px)`: a constant has to know how much chrome sits above
this pane in this host on this tab, and it is wrong the first time any of the
three changes. The element's own top already knows. Not `v-main` either — an
`app` footer reserves its space by padding `v-main` rather than bounding it, so
`v-main` is as tall as whatever is inside it and reports a pane's overflow back
as room. Every pane takes the same gap and the same floor, or two tabs end on
different lines.

`usePaneHeight()` in `common/paneHeight.ts` is the implementation; reach for it
rather than writing the arithmetic again.

**What makes it hold, 1: every flex child in the chain needs `min-height: 0`.**
A flex item defaults to `min-height: auto` — the height of its own content — so
a column holding a long table grows past the pane and takes the page's scroll
with it, while the `overflow` sitting right there never engages, because the box
is never smaller than what is in it. A measured pane above an unbounded child
buys nothing. This was the single most expensive defect in this codebase.

**What makes it hold, 2: the table is the scroller, not the column around it.**
`fixed-header` and a `height` resolved against the bounded parent —
`height="100%"`, never `max-height`, which leaves the percentage undefined and
renders the table full-length. A scrolling column instead of a scrolling table
puts the pager below every row on the page: to reach page two you first scroll
past all of page one, and the pager is the only control that matters there.

```html
<div :style="{ height: paneHeight }" class="d-flex">
  <div class="d-flex flex-column" style="min-width: 0; min-height: 0">
    <div style="flex: 0 0 auto">…toolbar…</div>
    <div style="flex: 1 1 auto; min-height: 0; overflow: hidden">
      <v-data-table fixed-header height="100%" style="height: 100%">…</v-data-table>
    </div>
  </div>
</div>
```

**What makes it hold, 3: the host's window is measured the same way.** A page
that caps its tabs at `calc(100vh - 140px)` while the panes inside measure to
the viewport gives itself a scrollbar of exactly the difference — and that
difference is what makes three tabs look like three heights. Keep `overflow-y:
auto` on the window for the case where the panes hit their floor.

### Traps

**Measure after the transition, not when it starts.** `v-tabs-window` animates
its items, so a pane measured at the instant it becomes visible is measured
where it was passing through — short coming up, tall going down — and it keeps
that height for the rest of its life. Re-measure on a frame, and again after the
animation settles. Two panes built from the same code ending on different sides
of the footer is this, every time.

**Never measure something inside a scrolling region.** The rule needs a fixed
top edge, and an element partway down a column that scrolls has none: measuring
it means re-measuring as the column scrolls, which is a loop — the height
changes the content height, which changes the scroll position, which changes the
top edge. The sheet then resizes under the reader's cursor and carries off
whatever they were reaching for. Better, bound the region so the table has a
real edge to fill — which is what the shape under _Layout_ is for.

Where that is not available, a constant, and a constant cannot oscillate. It
takes three bounds, because a fraction on its own does not know what sits
around it:

```css
max(240px, min(60vh, calc(100vh - 560px)))
/*  floor        target        what is actually left  */
```

The **target** is what to take when there is room. The **cap** subtracts the
sheet's own chrome — its title bar, its notices, the table's toolbar and pager,
whatever confirms, the action bar — and is the one that gets forgotten: at the
target alone, a 700px window puts a 420px table under 370px of chrome and the
confirmation goes off the bottom, where the table's own wheel handling makes it
awkward to scroll to. The **floor** is where this stops being a list anyone can
judge anything from; under it the column scrolls.

The cap is fitted by eye to one layout and is only right for that layout. When
the chrome changes, it changes.

**Nothing is padded below a self-bounding pane.** A `pb-4` under a pane that
already ends one gap above the footer puts it 16px past its container: the same
scrollbar, arrived at from the other end.

**Reach through `$el`, and refuse to measure anything without a
`getBoundingClientRect`.** A `ref` on a Vuetify component hands back the
component, not the element; measuring the instance throws during mount and takes
the pane — and whatever Vue unwinds with it — down. Nothing in the build catches
this.

---

## Inputs

**Dates and times use `DateTimePicker`, never `type="datetime-local"`.** The
native control is drawn by the browser: it ignores the theme, ignores any
white-label branding, and renders grey beside every other field on the pane. The
shared component composes Vuetify's own `VDatePicker` with hour/minute selects,
takes and emits the same `"YYYY-MM-DDTHH:mm"` string, and is what the task and
maintenance filters already use.

---

## State

**What the reader chose survives a reload.** The selected node and the filters
are persisted per object in the visual store, and restored only for the object
they were saved on — a level key means nothing in another resource's chain, and a
privilege that narrows a warehouse may name nothing under a tag.

**Restore filters before the first read**, so the request goes out narrowed
rather than fetching everything and hiding most of it.

**The store is what survives; the URL is for sharing.** Write the address bar
with `history.replaceState`, touching only the parameters the pane owns.
`router.replace` from inside a pane runs this app's guard pipeline and does not
reliably land — the namespace page stopped using it for the same reason.

**Strip the pane's parameters when it unmounts**, guarded on the path being
unchanged. A link that still names a warehouse while sitting on another tab
reads as though it selected that tab.

**Never gate a restore on a request.** On a reload the pane mounts before the
access token has hydrated, and the rejection that comes back says nothing about
whether the object exists. Restore first, verify afterwards, and move the reader
only on a 404 or a 403.

---

## Reporting

**A refusal about the request is not a snackbar.** Render it where the control
that caused it is: a filter the server will not accept, a permission not held, a
capability the backend does not offer. Reserve the snackbar for what happens
away from the reader's attention.

**Say which of those it is.** "Not offered by this authorizer", "not visible to
you" and the server's own message are three different answers and lead to three
different next steps.

**Never offer a picker that can produce a refused request.** Build it from what
the endpoint accepts in this context, not from everything the server publishes.

**State what a listing does not cover.** Where one half of a view is complete and
the other is a page at a time, say so under it rather than letting the reader
assume the table is the whole answer.
