# Reload concurrency checklist

Replacing "publish Loading, then the result" with "keep the loaded state during reload" is a concurrency change, not a UI tweak. While Loading was published, other code saw it and stood still: a sync refresh skipped, "load more" was hidden, a mutation's result was overwritten by the reload. Remove Loading and each of those becomes a race.

Before code, list every reader of the Loading state and every writer of the published state. Then cover each item below, with one test per guard:

- [ ] Reload flag. An `_isReloading` flag in the view model replaces the published Loading as the guard.
- [ ] One choke point for deferred work. Sync, refresh and remote pulls that arrive during a reload are recorded at one place and not started; the reload runs them once when it ends.
- [ ] Paging. `loadMore` does nothing during a reload.
- [ ] Newest load wins. Each reload takes an epoch (a counter). Only the newest load clears the flag, in `finally`, restarts live refresh and runs the deferred refresh once. An older load that finishes late publishes nothing.
- [ ] Final publish merges. The reload's last publish merges detail, errors and loading ids from the latest published state, not from the state when the reload started.
- [ ] Mutations survive. A rename or membership change that publishes during the reload is recorded and kept in the final publish.
- [ ] Newer caches survive. A cache updated during the reload (account labels, avatars) is not overwritten with the older copy the reload started with.

## Tests

Gate each fake repository call on a `Completer`, so the test decides when each load returns:

```dart
final teams = Completer<List<Team>>();
repository.onTeams = () => teams.future;

final reload = viewModel.reload();
await viewModel.rename('t1', 'Ops');        // publishes during the reload
teams.complete([const Team(id: 't1', name: 'Platform')]);
await reload;

expect(viewModel.value.teams.single.name, 'Ops');
```

Each test must fail when its guard is removed (see the revert step in the proof reference). A plan review that reads the old Loading readers often finds several races before any code; do it.
