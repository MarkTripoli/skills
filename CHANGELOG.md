# Changelog

## [0.2.0](https://github.com/MarkTripoli/skills/compare/v0.1.0...v0.2.0) (2026-09-16)


### ⚠ BREAKING CHANGES

* a checkout's portable install is now per group and standalone skill (skills/delivery/*, skills/show-me, skills/record-evidence) instead of skills/*; paths into the checkout gain the delivery/ segment. Installed and built trees are unchanged.

### Features

* add token-free workflow simulation and an eval harness ([cc80ad7](https://github.com/MarkTripoli/skills/commit/cc80ad756dd90c545b151786bd457da4182502a5))
* **ci-commit:** enforce conventional commit messages ([a3e1220](https://github.com/MarkTripoli/skills/commit/a3e122098486fc198f4ed6741e37d5f375b97770))
* **conventions:** require fresh-session handoff and context budget ([8c17183](https://github.com/MarkTripoli/skills/commit/8c17183089a14248e41d0dc7e3a84ed07c4c8ea8))
* **eval:** grade artifact content, links, and scope; record provenance ([2bff96c](https://github.com/MarkTripoli/skills/commit/2bff96cd768565d44ec79047db645ede924ced55))
* **eval:** run whole workflows with fresh processes and a chosen model ([7a6124a](https://github.com/MarkTripoli/skills/commit/7a6124a45eda21d98b8580907ce2bf1431807650))
* **install:** npx installer for every runtime ([05c8202](https://github.com/MarkTripoli/skills/commit/05c820230e0124aa59de2b58b70e8774d69b5195))
* **oh-my-pi:** run-task extension with a new session per phase ([ff7b080](https://github.com/MarkTripoli/skills/commit/ff7b080434a3259a240a421f8a2eedc123a1ee9b))
* **pi:** run-task extension with on-disk run state ([438dc33](https://github.com/MarkTripoli/skills/commit/438dc33b86d04a6ededce6f8cd9e31be3e2a92ff))
* publish portable agent skill collection ([b560d32](https://github.com/MarkTripoli/skills/commit/b560d324eb8ceb10eb99d564aad60a8189517e12))
* **record-evidence:** add before/after pairs and a dashboard layout; drop Windows ([82d53cc](https://github.com/MarkTripoli/skills/commit/82d53cccaa04f46898d1ee9e78e2f8a9b983b31a))
* **record-evidence:** add narrated multi-device evidence recording skill ([d8991bd](https://github.com/MarkTripoli/skills/commit/d8991bd4d7e05e11343308df4179d5f3821fb50c))
* **record-evidence:** make evidence recording an optional workflow phase ([2a0e4c9](https://github.com/MarkTripoli/skills/commit/2a0e4c946430f5b83347b27ff108f340b62aa89e))
* **record-evidence:** narrated multi-device evidence recording skill ([ea5bbdf](https://github.com/MarkTripoli/skills/commit/ea5bbdf75a68a6749f79a9f572d9c5bf6417bd65))
* **run-task:** add --status report and skill-file phase prompts ([f5a5e1f](https://github.com/MarkTripoli/skills/commit/f5a5e1f5e83fb3b8f3545965dfb69ac02f5cdbe9))
* **run-task:** ship a deterministic workflow module ([27a613e](https://github.com/MarkTripoli/skills/commit/27a613ec59b7b55205d3a6258fa52c50f872b03c))
* **start-task:** route a request to the workflow that fits it ([46812bc](https://github.com/MarkTripoli/skills/commit/46812bc132bd3c48701109c13757ff2b07dd1d3d))


### Bug Fixes

* **record-evidence:** verify Linux capture paths on remote hosts ([c1f30b1](https://github.com/MarkTripoli/skills/commit/c1f30b1e5756430bce0914068672e0de13302e4c))
* **record-evidence:** verify remaining capture paths and correct findings ([d85d9c7](https://github.com/MarkTripoli/skills/commit/d85d9c77f0785b08a9c99d7532c7030ff8b03eb5))
* **run-task:** predict fence arguments and check the table's next column ([2b5f659](https://github.com/MarkTripoli/skills/commit/2b5f659a64f4811334374bbde320f5018ad68849))
* **run-task:** treat a re-invocation at a pending gate as approval ([ab92582](https://github.com/MarkTripoli/skills/commit/ab925828a4b76f26bc24c2d7af062c6fd83897c7))
* **setup-worktree:** an invocation is not an override of disabled ([ce1eb1a](https://github.com/MarkTripoli/skills/commit/ce1eb1a0dab8f55e96e422405dcd4a5aa0a0184a))
* **skills:** close contract gaps found by workflow simulation ([322a556](https://github.com/MarkTripoli/skills/commit/322a5560879cfb2e65aae5eba1a32cf082b56539))
* **skills:** make handoff placeholders mechanical after real-agent runs ([583bf44](https://github.com/MarkTripoli/skills/commit/583bf4475fa762d6602beb06fe04f0a360545001))


### Code Refactoring

* group the delivery workflow skills under skills/delivery ([82c2955](https://github.com/MarkTripoli/skills/commit/82c29559fa3b6e88bcb4edcb034e5b59b99918a2))
