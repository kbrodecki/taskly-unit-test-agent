---- MODULE PRRun ----
EXTENDS Naturals

VARIABLES agent, output, detection, gates, push, report, blocked, cancelled, comments, checks, pushed

vars == <<agent, output, detection, gates, push, report, blocked, cancelled, comments, checks, pushed>>

Init ==
  /\ agent = "running" /\ output = "none"
  /\ detection = "pending" /\ gates = "pending" /\ push = "pending"
  /\ report = "pending" /\ blocked = "pending"
  /\ cancelled = FALSE /\ comments = 0 /\ checks = 0 /\ pushed = FALSE

AgentDone(o) ==
  /\ agent = "running" /\ ~cancelled
  /\ agent' = "success" /\ output' = o
  /\ UNCHANGED <<detection, gates, push, report, blocked, cancelled, comments, checks, pushed>>

AgentFails ==
  /\ agent = "running" /\ ~cancelled
  /\ agent' = "failure" /\ output' = "none"
  /\ UNCHANGED <<detection, gates, push, report, blocked, cancelled, comments, checks, pushed>>

NewPush ==
  /\ ~cancelled /\ report = "pending"
  /\ cancelled' = TRUE
  /\ UNCHANGED <<agent, output, detection, gates, push, report, blocked, comments, checks, pushed>>

\* detection job: always() && agent != skipped. "verdict" = result success and detection_success true.
\* "failure" = threat found (continue-on-error false). "noverdict" = job green but detection_success not true
\* (detector unavailable or parse_error). When the agent job failed, gh-aw skips detection with success=true.
DetectionDone(d) ==
  /\ agent \in {"success", "failure"} /\ detection = "pending"
  /\ ~cancelled
  /\ IF agent = "failure" THEN d \in {"verdict", "noverdict"} ELSE d \in {"verdict", "failure", "noverdict"}
  /\ detection' = d
  /\ UNCHANGED <<agent, output, gates, push, report, blocked, cancelled, comments, checks, pushed>>

GatesRun(g) ==
  /\ detection = "verdict" /\ gates = "pending" /\ ~cancelled
  /\ IF agent = "failure" THEN g = "failure" ELSE g \in {"success", "failure"}
  /\ gates' = g
  /\ UNCHANGED <<agent, output, detection, push, report, blocked, cancelled, comments, checks, pushed>>

GatesSkipped ==
  /\ detection \in {"failure", "noverdict"} /\ gates = "pending"
  /\ gates' = "skipped"
  /\ UNCHANGED <<agent, output, detection, push, report, blocked, cancelled, comments, checks, pushed>>

PushRun(p) ==
  /\ gates = "success" /\ push = "pending" /\ ~cancelled
  /\ p \in {"success", "failure"}
  /\ push' = p
  /\ pushed' = (p = "success" /\ output = "tests")
  /\ UNCHANGED <<agent, output, detection, gates, report, blocked, cancelled, comments, checks>>

PushSkipped ==
  /\ gates \in {"failure", "skipped"} /\ push = "pending"
  /\ push' = "skipped"
  /\ UNCHANGED <<agent, output, detection, gates, report, blocked, cancelled, comments, checks, pushed>>

\* report: detection.result == success && detection_success == true && !cancelled()
ReportPublishes ==
  /\ push /= "pending" /\ report = "pending"
  /\ detection = "verdict" /\ ~cancelled
  /\ report' = "done" /\ comments' = comments + 1 /\ checks' = checks + 1
  /\ UNCHANGED <<agent, output, detection, gates, push, blocked, cancelled, pushed>>

ReportCrashes ==
  /\ push /= "pending" /\ report = "pending"
  /\ detection = "verdict" /\ ~cancelled
  /\ report' = "failure"
  /\ UNCHANGED <<agent, output, detection, gates, push, blocked, cancelled, comments, checks, pushed>>

ReportSkipped ==
  /\ push /= "pending" /\ report = "pending"
  /\ (detection /= "verdict" \/ cancelled)
  /\ report' = "skipped"
  /\ UNCHANGED <<agent, output, detection, gates, push, blocked, cancelled, comments, checks, pushed>>

\* report_blocked: always(); its steps run only when needs.detection.result == 'failure'
BlockedPublishes ==
  /\ detection = "failure" /\ blocked = "pending" /\ ~cancelled
  /\ blocked' = "done" /\ comments' = comments + 1 /\ checks' = checks + 1
  /\ UNCHANGED <<agent, output, detection, gates, push, report, cancelled, pushed>>

BlockedNoop ==
  /\ detection \in {"verdict", "noverdict"} /\ blocked = "pending" /\ ~cancelled
  /\ blocked' = "done"
  /\ UNCHANGED <<agent, output, detection, gates, push, report, cancelled, comments, checks, pushed>>

CancelledRest ==
  /\ cancelled
  /\ (detection = "pending" \/ gates = "pending" \/ push = "pending" \/ report = "pending" \/ blocked = "pending")
  /\ detection' = IF detection = "pending" THEN "cancelled" ELSE detection
  /\ gates' = IF gates = "pending" THEN "cancelled" ELSE gates
  /\ push' = IF push = "pending" THEN "cancelled" ELSE push
  /\ report' = IF report = "pending" THEN "cancelled" ELSE report
  /\ blocked' = IF blocked = "pending" THEN "cancelled" ELSE blocked
  /\ UNCHANGED <<agent, output, cancelled, comments, checks, pushed>>

Finished == report /= "pending" /\ blocked /= "pending"

Done == Finished /\ UNCHANGED vars

Next ==
  \/ AgentDone("tests") \/ AgentDone("noop") \/ AgentFails
  \/ NewPush
  \/ DetectionDone("verdict") \/ DetectionDone("failure") \/ DetectionDone("noverdict")
  \/ GatesRun("success") \/ GatesRun("failure") \/ GatesSkipped
  \/ PushRun("success") \/ PushRun("failure") \/ PushSkipped
  \/ ReportPublishes \/ ReportCrashes \/ ReportSkipped
  \/ BlockedPublishes \/ BlockedNoop
  \/ CancelledRest
  \/ Done

Spec == Init /\ [][Next]_vars

\* Rule 1: every finished run that was not cancelled by a new push has exactly one PR comment and one check run.
OneReport == (Finished /\ ~cancelled) => (comments = 1 /\ checks = 1)

\* Rule 2: tests reach the PR branch only after a threat detection verdict and all gates passed.
PushOnlyAfterGates == pushed => (detection = "verdict" /\ gates = "success")
====
