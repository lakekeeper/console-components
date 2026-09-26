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

**Measure the pane's top edge; do not compute a height from the viewport.**
`calc(100vh - 240px)` has to know how much chrome sits above it, which differs by
host and by tab. Overshoot and the page grows a scrollbar beside the pane's own.

```ts
const top = el.getBoundingClientRect().top;
height.value = `${Math.max(MIN, Math.round(window.innerHeight - top - 24))}px`;
```

Re-measure on `resize` and once more in a `requestAnimationFrame` after mount, so
the pane is measured where it ends up rather than where it starts.

Reach through `$el`, and refuse to measure anything without a
`getBoundingClientRect`. A `ref` on a Vuetify component hands back the component,
not the element; measuring the instance throws during mount and takes the pane —
and whatever Vue unwinds with it — down. Nothing in the build catches this.

**Every scrollable region is bounded by its own container.** The app shell
disables page scroll; a pane that does not bound itself scrolls the window.

**A measured pane is worth nothing if a flex child inside it refuses to shrink.**
This is the single defect that cost the most: a flex item's default is
`min-height: auto`, which is the height of its own content, so a column holding a
long table simply grows past the pane it lives in and takes the page's scroll
with it — while the `overflow-y: auto` sitting right there never engages, because
the box is never smaller than what is in it. Every flex child between the measured
pane and the scrolling region needs `min-height: 0`.

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

**A table is bounded by the region, never by its row count.** `fixed-header` plus
a `height` resolved against the bounded parent — `height="100%"`, not
`max-height`, which leaves the percentage undefined and makes the table render
full-length and clip.

**The host's window is measured the same way its panes are.** A page that wraps
its tabs in `max-height: calc(100vh - 140px)` while the panes inside measure to
the viewport gives itself a scrollbar of exactly the difference, and that
difference is what makes three tabs look like three different heights. Measure
the window too, keep `overflow-y: auto` on it for the case where the panes hit
their minimum, and give every pane the same floor.

**Nothing is padded below a self-bounding pane.** A `pb-4` under a pane that
already ends one gap above the footer puts it 16px past its container — the same
scrollbar, arrived at from the other end.

**Inside a dialog, measure the body's visible height, not its content.** The two
differ by exactly what an unbounded table would add, so measuring content feeds
the table's size back into its own bound. The visible box is also independent of
where the body is scrolled to, which a measurement from the table's top edge is
not.

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
