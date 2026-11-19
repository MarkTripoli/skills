# #reporting-platform thread, exported November 9, 2026

**Priya (support lead), Nov 2:** Lots of customers complain that the nightly export never arrives. Can we finally fix reportd? It is a really significant problem for the big accounts.

**Tomas (reportd maintainer), Nov 2:** The cause is known. reportd builds each export in one request and the gateway cuts every request at 15 minutes. Large tenants cross that line. When the request dies the work is lost and the customer gets nothing until the next night. Numbers for October are in `docs/metrics.md`.

**Tomas, Nov 3:** Proposal: stop building exports inside a request. Put each export on a queue, build it in chunks of 50,000 rows, and save a checkpoint after each chunk so a retry resumes where it stopped. Retry a failed chunk 3 times, then mark the export failed and email the tenant admin.

**Wen (SRE), Nov 3:** Two other options. One: raise the gateway timeout to 60 minutes. That holds a connection per export and the gateway allows 200, and it does nothing for a restart in the middle of an export. Two: move reportd to a larger machine. I tested it last quarter: the p95 dropped from 14 minutes to 11 and the cost doubled. Growth eats that margin in about two quarters.

**Priya, Nov 4:** If we do nothing, support keeps opening a ticket per failed export for the enterprise tier. Each one takes us about 25 minutes.

**Wen, Nov 5:** Queue workers cost more than the one machine today. See the cost rows in the metrics file. I do not know yet how long a full backfill of the checkpoint table takes. I can measure it by November 20.

**Dana (platform lead, decides), Nov 6:** Decisions so far. Retries: 5, not 3. The email goes out only after the last retry fails, never per retry. A customer must never receive a partial file. We keep the 02:00 UTC schedule. I need an RFC I can read in one sitting, and I will decide at the review on December 4, 2026. Tomas owns the RFC.

**Tomas, Nov 6:** Understood. Rollout would be internal tenants first, then 10% of tenants, then all. Not in scope: on-demand exports and the CSV format itself.

**Dana, Nov 9:** One more thing nobody answered: how many accounts actually complained? I do not want "lots" in the document.

**Priya, Nov 9:** We count tickets, not accounts. I can pull the account count from the ticket system, but not this week.
