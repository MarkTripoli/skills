# iOS simulator disposable fixture

This is a policy-free native implementation of the web fixture state: a name field, a channel choice, a Confirm button, and an independently readable status. It contains no JEV client, model call, locator, or prescribed action sequence.

The bundle is `ai.typesafe.jevfixture`. From this directory, build, install, and launch only the prepared supervisor simulator:

```sh
./install-authorized.sh 7A023F51-F0DA-4179-868B-19207E433651
```

The script refuses every other UDID, uses `xcodebuild` plus `simctl`, writes transient derived data under a temporary directory outside this source tree, removes that directory on exit, and does not boot or stop a simulator. The target is an iOS simulator, not a physical phone.
