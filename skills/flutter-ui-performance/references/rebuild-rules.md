# Rebuild rules

## Contents

- Keep data in the view model
- Unknown is not empty
- Per-item notifiers instead of parent setState
- UI state that survives scroll-off
- Prefetch, not keep-alive
- Stable keys for stateful rows
- Work once per state
- Paging resets
- Kept rows only with unchanged filters and scope
- Missing detail for a mounted row
- State equality is a separate change

Examples use a Teams screen: a view model publishes `TeamsState` (teams plus members per team id), and each row expands to show members.

## Keep data in the view model

The view model owns every value a row renders, including the last known value. The widget reads and renders; it does not cache, merge or remember data across builds.

## Unknown is not empty

Model "not loaded yet" separately from "loaded, and empty". Keep the last known value next to the live one, refresh it once per published state (in the view model's `value` setter, not in a build), and carry it over while the live value is unknown.

```dart
@override
set value(TeamsState next) {
  // Known values, including empty lists, replace the kept ones. Unknown ids keep theirs.
  _keptMembers = {..._keptMembers, ...next.members};
  super.value = next;
}

/// null: unknown and nothing kept. Render a placeholder, never "No members".
List<String>? membersFor(String teamId) => value.members[teamId] ?? _keptMembers[teamId];
bool isStale(String teamId) => !value.members.containsKey(teamId);
```

While a value is stale, render it read-only with no actions (no rename, no remove), because an action on stale data can act on something that changed.

## Per-item notifiers instead of parent setState

A per-item flag gets a per-item `ValueNotifier` (or `ChangeNotifier`) keyed by item id, read through `ValueListenableBuilder` or `ListenableBuilder` inside the row. Only that row rebuilds.

- A single-valued flag that moves between items (the one selected row): update the old and the new item's notifier, so both rows rebuild and no other row does.
- A screen-level flag (a banner, a selection mode): its own `ValueNotifier` at screen level.
- `setState` in the screen `State` stays only for whole-list changes, such as the search query.

## UI state that survives scroll-off

A row's `State` is disposed when it leaves the cache extent. State the user expects to keep (expanded, selected) lives in the view model, outside the published state, so toggling it does not publish a new screen state.

```dart
final Map<String, ValueNotifier<bool>> _expanded = {};

ValueListenable<bool> expanded(String teamId) =>
    _expanded.putIfAbsent(teamId, () => ValueNotifier(false));

void toggleExpanded(String teamId) {
  final flag = _expanded.putIfAbsent(teamId, () => ValueNotifier(false));
  flag.value = !flag.value;
}

@override
void dispose() {
  for (final flag in _expanded.values) {
    flag.dispose();
  }
  super.dispose();
}
```

Do not prune these on a filter change: an item filtered out and back in keeps its expansion.

## Prefetch, not keep-alive

Build rows ahead of the viewport so a fast scroll does not build them on the frame they appear:

```dart
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

ListView.builder(
  scrollCacheExtent: const ScrollCacheExtent.viewport(1.5),
  itemCount: teams.length,
  itemBuilder: (context, index) => TeamRow(key: ValueKey(teams[index].id), team: teams[index]),
)
```

`cacheExtent` is deprecated from Flutter 3.41; on an older Flutter, set `cacheExtent` in pixels instead. `AutomaticKeepAliveClientMixin` is not a fix: it keeps every visited row alive for the life of the list and hides the real problem, state held in the row. A shared list wrapper exposes `scrollCacheExtent` as an optional parameter whose default (`null`) leaves its callers unchanged.

## Stable keys for stateful rows

Key every stateful row by a stable id (`ValueKey(row.id)`), so its `State` (an animation controller, a draft) stays with the row when rows are inserted above it. Check the id is unique among siblings; a duplicate key throws.

## Work once per state

Sort, filter and group once per build in the parent, or once per published state in the view model, and pass the result down. Never inside `itemBuilder`, and never through a sorting getter called several times per build. A `const` state class cannot cache a derived list, so compute it in the parent build.

## Paging resets

A visible count or page index held in a widget resets only when the scope (the selected parent id) or the filters change, or the list becomes empty. A new list object is not a reset: every sync re-sorts into a new list. Pass the scope id as a parameter and compare it in `didUpdateWidget`; do not use it as the widget key, because a key change also drops other `State` such as a search draft.

## Kept rows only with unchanged filters and scope

During a reload, show kept rows only when filters and scope are unchanged since the last settled render. After a filter or scope change show loading, never stale rows that may not match. Hide "load more" while loading.

## Missing detail for a mounted row

An expanded row that mounts without its detail (the kept expansion outlived the data) requests the detail itself: post-frame, and only when the detail is neither loading nor failed, so a failure does not loop.

## State equality is a separate change

`==` on the published state class lets `ValueNotifier` skip unchanged emissions, but a wrong `==` hides real updates. Audit lists candidates; each lands in its own change with tests that a changed field still notifies.
