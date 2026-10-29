# Proof

A slice is done when every new test fails on the base, passes on the change, and the rebuild scope is pinned by a test.

## Behavior tests that fail on the base

Test at the screen boundary with `testWidgets`:

- Expansion survives scroll-off: expand a row, `scrollUntilVisible` far past the cache extent, assert the row's element is gone (`find.byKey(...)` finds nothing), scroll back, assert it is still expanded.
- No flash during reload: start a reload with a Completer-gated fake, pump, assert the kept value still shows and no empty text ("No members") or Loading state was published.
- Paging kept: show more rows, publish a new list object with the same scope and filters, assert the visible count is unchanged.
- Row `State` kept: insert a row above a stateful row, assert its `State` is the same object (`tester.state(...)` identical before and after).

## Rebuild-scope test

```dart
testWidgets('expanding a team rebuilds only its row', (tester) async {
  await tester.pumpWidget(app);
  final lines = <String>[];
  final previous = debugPrint;
  final previousRebuildFlag = debugPrintRebuildDirtyWidgets;
  debugPrint = (String? message, {int? wrapWidth}) {
    if (message != null) lines.add(message);
  };
  debugPrintRebuildDirtyWidgets = true;
  try {
    await tester.tap(find.text('Platform'));
    await tester.pump();
  } finally {
    debugPrintRebuildDirtyWidgets = previousRebuildFlag;
    debugPrint = previous;
  }
  final screen = RegExp(r'\b(Building|Rebuilding) (TeamsScreen|TeamsBody|ListView)\b');
  expect(lines.where(screen.hasMatch), isEmpty);
  expect(lines.where((line) => line.contains('TeamRow')), isNotEmpty);
});
```

The framework prints `Building <widget>` on a first build and `Rebuilding <widget>` afterwards; match both. Restore both globals in `finally`, or a failing test leaks them into every later test.

When the base already rebuilt only that row, the test cannot fail on the base. Name it a regression guard in the test name or a comment and in the report; do not count it as proof of the fix.

## Prove failure without the fix

For each new test:

1. Create an isolated temporary worktree at the recorded base commit and copy only the new tests into it. Keep the changed source and dirty user files in the working checkout untouched.
2. Run each new test against that base source; record its decisive failure.
3. Run the same test against the changed source with the same SDK and dependencies; record the pass.

For a non-Git project, use separate temporary copies of the captured before and after source. Never use `git stash`: its stack is shared by every worktree and session.

## Live evidence

When the repository asks for before and after captures, record both on the same device size. On an emulator, a keyboard inset left over from earlier typing (onboarding, a search field) can shrink lists on any build. Relaunch the app before each capture, and before blaming the code for a short list, reproduce it with a widget test at the device size.
