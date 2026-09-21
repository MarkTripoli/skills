---
slug: one-thing-i-m
title: "One thing I'm noticing is that when we use our skills, we're constantly using the most expensive frontier models for things like"
workflow: full
gates: none
routed_by: deliver
route_confidence: 0.98
created: 2026-09-20
---
One thing I'm noticing is that when we use our skills, we're constantly using the most expensive frontier models for things like
Fable, Astra, and Opus. We're using all of these for coding, implementation, tool calls, and similar tasks, not just for reviewing, planning, or
tasks that require higher levels of thinking. That's a problem.

We should only use those models in moderation for the most complex tasks, the most reasoning, reviews, planning, and similar tasks. For everything
else, we should be using cheaper models like Luna, Sonnet, Haiku, or any of these cheap models as our default. I'm wondering: how can we enforce
that?

And it's generally a question of whether we should be improving our model selection always. I think what I want to default to is that, when we have
Jev available to us, we should have Jev determine the models we need. Even more than that, I feel like we need some way to determine which models are
available to us and which ones we should be selecting. I'm not sure if that's something our skills repo should handle internally or if that's
something we should be setting up as well in our repository. I'm not exactly sure.
