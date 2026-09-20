# Android disposable fixture

This is a policy-free native implementation of the web fixture state: a name field, a channel choice, a Confirm button, and an independently readable status. It contains no JEV client, model call, locator, or prescribed action sequence.

The package is `ai.typesafe.jevfixture`. From this directory, build, install, and launch only the prepared supervisor target:

```sh
./install-authorized.sh emulator-5560
```

The script refuses every other serial, uses Gradle and the installed Android SDK, writes transient build output under a temporary directory outside this source tree, removes that directory on exit, and does not boot or stop a device. `emulator-5560` is an Android emulator, not a physical phone.
