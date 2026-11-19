# Store CI build artifacts in a shared cache

Status: Draft
Author: Dara Whitfield
Decider: Imani Okafor, release engineering lead
Decision needed by: June 10, 2027

## Decision

The team will move CI build artifacts into a shared cache, because it cuts the median pipeline from 38 minutes to 17. It costs $420 a month. It also makes every build depend on the cache host, so the cache must be able to fail without stopping a build.

## Problem and goals

A developer who opens a pull request waits for a pipeline before a reviewer will look at it. The median pipeline takes 38 minutes, and the team runs 2,100 pipelines a week [1]. That is about 1,330 hours of waiting a week, an estimate from the median and the weekly count.

A large part of that time repeats work that was already done. In a sample of 200 pipelines, 61% of build time went to compiling modules whose inputs had not changed since the last run [2]. Each job starts on a clean runner, so the result of an earlier job is lost.

The idea came up at the March infrastructure sync, when Tomas Reyes from the mobile team asked why the nightly build took so long. Three people agreed to look into it. A small working group met twice in April, and Dara Whitfield wrote the first prototype after the second meeting.

How it works today:

1. A developer pushes a commit, and the pipeline starts one job for each module group.
2. Each job starts on a clean runner and fetches the source.
3. Each job compiles every module in its group, including modules that did not change.
4. Each job uploads its test results and drops its compiled output when the runner is recycled.

Doing nothing keeps the median pipeline at 38 minutes [1]. The queue for runners also grows as the team adds modules, and the team adds about three modules a month [1].

The design must:

1. Bring the median pipeline under 20 minutes by September 30, 2027.
2. Keep a build correct when the cache is empty, slow or down.
3. Never serve an artifact built from different inputs than the ones the job has.
4. Add less than $500 a month in running cost.

Priorities, when goals conflict:

1. A correct build, over a fast build.
2. A fast build, over a low running cost.

A shorter pipeline also changes how developers work. A developer who waits for a pipeline starts another task and returns later, which delays the review and the merge. The team cannot measure that delay today, so the goals count only the pipeline time.

### Out of scope

- A cache for developer laptops. Laptop builds use a different toolchain, and that work waits for a later RFC.
- A cache for container images. The image registry already caches layers.

## Options

| Option | Median pipeline | Running cost | Correct without the cache | Verdict |
|---|---|---|---|---|
| A. Shared cache in object storage | 17 minutes, the prototype result [4] | $420 a month [3] | Yes, a miss runs a full build | Recommended |
| B. Larger runners | 31 minutes [5] | $1,150 a month [5] | Yes | Rejected |
| C. Do nothing | 38 minutes [1] | $0 | Yes | Rejected |

**A. Shared cache in object storage.** Each job computes a key from its inputs and looks for a stored artifact under that key. A hit skips the compile. A miss runs the compile and stores the result. This is the only option that removes the repeated work, and it fits inside the $500 limit on running cost.

**B. Larger runners.** Runners with twice the CPU cut the median pipeline to 31 minutes [5]. They still compile unchanged modules on every run, so the same wasted work runs on dearer machines [2]. They cost $1,150 a month [5], which is $730 more than option A [3], for 14 minutes less improvement [4][5].

**C. Do nothing.** This keeps the cost at $0 and the median pipeline at 38 minutes [1]. The runner queue grows with each new module, so the wait gets worse over time.

## Proposed design

The team will move CI build artifacts into a shared cache, because it cuts the median pipeline from 38 minutes to 17, at a cost of $420 a month.

### Cache keys

Each job computes a key from the hash of its source files, the hash of its dependency lock file, the compiler version and the target platform. Two jobs with the same key must produce the same artifact. A change to any input produces a new key, so a stale artifact is never served.

The key does not include the commit hash. Two commits that touch different modules share the entries for the modules neither commit touched. That sharing is where the saving comes from.

### Storage

Artifacts live in three regional buckets. Builds in the Frankfurt region read from the Frankfurt cache bucket. Builds in the Virginia region read from the Virginia cache bucket. Builds in the Singapore region read from the Singapore cache bucket.

A write goes to the bucket in the region of the job that built the artifact. A job never reads from another region, because the transfer cost would erase the saving.

### Entry size

A single entry cannot be larger than 2 GB. A job whose output is larger skips the upload and logs a warning. Three modules in the monorepo produce output larger than 2 GB today [2], and they keep their current full build.

### Retention

An entry is deleted 14 days after its last read. The prototype held 780 GB at that setting [4], which fits the storage in the vendor quote [3]. A shorter period saves little storage and lowers the hit rate.

### Layering

Content-addressed blobs are written idempotently behind a write-through proxy, and cache misses fall through to a hydrate step that rehydrates the layer graph. The proxy runs as a sidecar on each runner and holds no state of its own.

For a developer, the effect is plain: a pull request that touches one module starts its pipeline with the other modules already built.

### Read path

A job asks the cache for its key before it compiles. The read timeout is 2 seconds. A read that times out counts as a miss, and the job compiles as it does today. The 95th percentile read time in the prototype was 90 ms for a 200 MB entry [4], so a timeout is rare.

### Access

Runners read and write the cache with a short-lived token that the pipeline issues for one job. A job from a forked repository gets a read-only token, so an outside contributor cannot place an artifact that a later job on the main branch would read. Tokens expire when the job ends.

### Monitoring

The proxy reports the hit rate, the read time and the number of failed reads for each region. The platform team gets an alert when the hit rate stays under 40% for an hour, or when more than 5% of reads time out. Both numbers are limits the team sets and revisits after a month of data.

### Build tool support

The build tool that the monorepo uses already supports a remote cache through a plain HTTP interface. The team writes a small adapter that translates its read and write calls into object storage calls, and no module changes its build files. A module that opts out of the cache sets one flag in its configuration, and the nightly rebuild skips it.

### Test results

The cache holds compiled output only. A test result is never cached, because a test that passed against one artifact says nothing about a changed environment. Every pipeline runs the tests that cover the modules it touched, as it does today.

### Dependency updates

A change to the dependency lock file changes the key of every module that uses the changed package. The first pipeline after an upgrade therefore runs a full build for those modules and fills the cache for the pipelines that follow. The team accepts that the upgrade pipeline is slow, because it is rare and the next pipeline is fast.

### Cleanup of the key space

The key format carries a version prefix. When the team changes how a key is computed, it raises the prefix, and old entries stop matching without any deletion. The retention rule removes them after 14 days.

### Verification

Every stored entry carries a checksum of its content. A job checks the checksum after it reads an entry and treats a mismatch as a miss. The job then deletes the bad entry so the next job does not read it again.

## Cost

| Running cost | Today | After |
|---|---|---|
| Object storage, 780 GB | $0 | $180 a month [3] |
| Data transfer within a region | $0 | $90 a month [3] |
| Proxy and metadata service | $0 | $150 a month [3] |
| Total | $0 | $420 a month [3] |

The team accepts three costs.

The first is a new service to run. The platform team owns the cache and its alerts, and it estimates two hours of on-call work a month for the cache.

The second is a build that is only as correct as its key. A missing input in the key serves a wrong artifact. The design reduces that risk with the checksum and with a nightly job that rebuilds a random sample of entries from scratch and compares them with the stored ones. The sample is 20 entries, an estimate of a size that keeps the check small.

The third is that the three modules above 2 GB gain nothing from the cache [2]. They keep their current build time.

## Failure modes and risks

| Trigger | Effect | Response |
|---|---|---|
| The cache host is down | Every read times out after 2 seconds and counts as a miss, so the pipeline runs at today's 38 minutes [1] | Builds continue; the platform team is paged and restores the host |
| A key omits an input | A job gets an artifact built from different inputs, and a test may pass for the wrong reason | The nightly rebuild finds the entry within 24 hours, an estimate, and deletes it; the key is fixed |
| An entry is corrupt | The checksum fails and the job runs a full build for that module | The job deletes the entry |
| The cache fills with old entries | Storage cost grows past the quote | Old entries need a cleanup rule, and the team adds one |
| A region's bucket is lost | Builds in that region run at today's speed until the bucket is rebuilt | Each region fills its own bucket again from new builds |

Nothing above the 2 GB limit is ever written to the cache, so a single large job cannot fill a bucket. A job that tries to upload more skips the upload and its build is unaffected.

To undo the change, the team turns the cache flag off in the pipeline configuration. Every job then compiles as it does today, with no data to migrate.

## Outcomes

| Outcome | Measure | Today | Target |
|---|---|---|---|
| Developers wait less for a pipeline | Median pipeline time | 38 minutes [1] | 17 minutes, the prototype result [4] |
| Builds stop repeating work | Share of build time spent compiling unchanged modules | 61% [2] | Under 20%, the target |
| The cache keeps builds correct | Wrong artifacts found by the nightly rebuild | Not applicable | 0 a month, the target |
| Running cost stays small | Added monthly running cost | $0 | $420 a month [3] |

## Open questions

| Question | Our proposal |
|---|---|
| Which of the three regions should hold the metadata service? | Virginia, because most pipelines start there. The vendor quote prices all three the same [3]. |
| Should the three modules above 2 GB be split so they fit the cache? | Not in this RFC. The split changes the module boundaries, and the module owners have not weighed in. |

## Sources

1. Pipeline timings and weekly counts, CI dashboard, April 2027
2. Build profile of 200 sampled pipelines, platform team, April 2027
3. Storage and hosting quote, vendor, May 2027
4. Load test of the cache prototype, platform team, May 2027
5. Runner price list and benchmark, vendor, May 2027
