# Audit signals

Why a list item rebuilds or loses state, what to search for, and how to record it.

## Why a row rebuilds or loses state

1. Lazy build and dispose. A `ListView.builder` builds rows near the viewport. A row that leaves the cache extent (about 250 logical pixels by default) is disposed, and its `State` (expanded flag, animation controller, text draft) is lost.
2. Parent `setState`. A `setState` in the screen `State` rebuilds the toolbar, every visible row and every section. Toggling one row this way is the most common cost.
3. A new state object per emission. `ValueNotifier` skips notifying only when `==` says the values are equal. A state class without `==` notifies on every sync emission, even when nothing changed.
4. Data cleared during reload. `copyWith(members: const {})` at the start of a reload makes every row show "none" and then the data again: a flash. The view model treated unknown as empty.

## Searches

Run from the app root. Each hit is a candidate, not a finding; read the code around it.

```sh
grep -rn "setState(" lib/ --include=*.dart
grep -rn "ListView(\|ListView.builder\|ListView.separated\|SliverList\|CustomScrollView" lib/ --include=*.dart
grep -rn "cacheExtent\|scrollCacheExtent\|AutomaticKeepAlive\|wantKeepAlive" lib/ --include=*.dart
grep -rn "copyWith(.*: const \[\]\|copyWith(.*: const {}\|\.clear()" lib/ --include=*.dart
grep -rn "operator ==" lib/ --include=*.dart
grep -rn "\.sort(\|\.where(\|sorted\|firstWhere(" lib/ --include=*.dart
```

## What to record per screen

| Signal | Finding when |
|---|---|
| `setState` sites | It toggles per-item UI state (expanded, selected, hover) or wraps the list |
| `ListView(children:)` | The list is long or grows with data; a short static list is fine |
| Cache extent | A row holds `State` the user expects to keep and the extent is the default |
| Per-item `State` | The row is a `StatefulWidget` whose state is not mirrored in the view model |
| Keys | A stateful row has no key, or a key that is not unique among siblings |
| State `==` | The published state class has no `==` and the source emits often (record as a separate candidate) |
| Per-item work | `itemBuilder` sorts, filters or searches the whole list, or calls a sorting getter |
| Unknown as empty | A reload or refresh writes an empty collection before the load finishes, or the widget renders a missing key as empty |
| Paging | A visible-count or page index resets when a new list object arrives |

## Audit table

```markdown
| Rank | Screen | Finding | Evidence | Impact | Risk | Rule |
|---|---|---|---|---|---|---|
| 1 | TeamsScreen | Expand toggles parent setState; whole list rebuilds | lib/teams/teams_screen.dart:52 | Every tap, all rows | Low | Per-item notifiers |
```

One row per finding, grouped by screen, highest rank first. A screen with no finding gets one row that says so, so the reader sees it was checked.
