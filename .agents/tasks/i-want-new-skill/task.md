---
slug: i-want-new-skill
title: "I want to create a new skill that is for slack. More specifically, i want a mechanism for our Agent(s) to write to slack. They could write a number of different things but what I am thinking initially is:"
workflow: prd
gates: all
routed_by: deliver
created: 2026-09-21
route_confidence: 0.45
---
I want to create a new skill that is for slack. More specifically, i want a mechanism for our Agent(s) to write to slack. They could write a number of different things but what I am thinking initially is:
   1. Agent sends a message saying they are starting work and provide some loose deteails
   2. Agent Reports a status update on some sort of interval (1hr?) that speaks about things like: decisions made, blockers, current work, up next work, what was done, workflow transitions, etc.
   3. Work completion

   Theres going to be more stuff as well but I want to focus on these right now and I want schema templates for these to determinstically enforce how and what the agents write. I also want a mechanism that allows the OWNER
   of the agent/work to ask questions, steer the agent, etc. from the slack thread for the work being performed.

   I think there is a lot here including working with the ticketing system you are using like JIRA, Github Issues, Linear, etc. to place useful inofrmation like a link to the Slack thread.

   I do ONLY want tof ocus on slack right now but we need to organize these tempaltes/skills/etc such that wer can take these concepts an move them to other chat systems in the future and Slack is just a transport really.
   Lets deep dive on this when we go into the product talk thoughts
