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

| Gesture                       | Icon                                                   |
| ----------------------------- | ------------------------------------------------------ |
| App navigation drawer         | `mdi-menu` — reserved for the shell                    |
| Fold a pane's own column      | `mdi-arrow-collapse-left` / `mdi-arrow-expand-right`   |
| Fold a host's selector column | `mdi-chevron-double-left` / `mdi-chevron-double-right` |
| Disclose a section in place   | `mdi-chevron-up` / `mdi-chevron-down`                  |

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

**Show what is set while collapsed.** A badge with the count of active filters,
and a `Clear`, both only when something is actually set.

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

**Every scrollable region is bounded by its own container.** The app shell
disables page scroll; a pane that does not bound itself scrolls the window.

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
