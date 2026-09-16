Route: {workflow}. {reason}

Task created: `{task_dir}/task.md` (workflow `{workflow}`{with_note}). By hand, the chain starts with {first_command} in a new session; the command below lets `run-task` drive every phase and stop at the human gates.

Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

```text
/run-task @{task_dir}
```
