export const title = 'Unit Test Agent: one PR run (jobs of unit-test-agent.lock.yml)';

export const state = (v) => {
  if (v.cancelled) return 'Cancelled by a new push';
  if (v.agent === 'running') return 'Agent writing tests';
  if (v.detection === 'pending') return v.agent === 'failure' ? 'Agent failed, detection pending' : 'Detection pending';
  if (v.detection === 'noverdict' && v.report === 'pending') return 'No detection verdict';
  if (v.detection === 'failure' && v.blocked === 'pending') return 'Threat detected';
  if (v.detection === 'verdict' && v.gates === 'pending') return 'Gates running';
  if (v.gates === 'failure' && v.report === 'pending') return 'Gates blocked';
  if (v.gates === 'success' && v.push === 'pending') return 'Pushing tests';
  if (v.push === 'failure' && v.report === 'pending') return 'Push failed';
  if (v.gates === 'success' && v.push === 'success' && v.report === 'pending') return v.output === 'tests' ? 'Tests pushed, report pending' : 'Nothing to test, report pending';
  if (v.report === 'done') {
    if (v.pushed) return 'Done: tests pushed, green check';
    if (v.output === 'noop' && v.gates === 'success' && v.push === 'success') return 'Done: nothing to test, neutral check';
    return 'Done: red check, nothing pushed';
  }
  if (v.blocked === 'done' && v.detection === 'failure') return 'Done: threat blocked, red check';
  if (v.report === 'failure') return 'Done: report job failed, fallback red check';
  if (v.report === 'skipped') return 'Done: no report job ran';
  return 'Other';
};

export const step = (a, from, to) => {
  if (a.startsWith('Done')) return null;
  if (a.startsWith('CancelledRest')) return null;
  if (a.startsWith('AgentDone')) return to.output === 'tests' ? 'agent commits tests' : 'agent finds nothing to test';
  if (a.startsWith('AgentFails')) return 'agent job fails [timeout, max turns, crash]';
  if (a.startsWith('NewPush')) return 'author pushes again';
  if (a.startsWith('DetectionDone')) return to.detection === 'verdict' ? (from.agent === 'failure' ? 'detection skipped as passed [agent left no output]' : 'threat detection passes') : to.detection === 'failure' ? 'threat detection finds a threat' : 'threat detection gives no verdict [detector crash or parse error]';
  if (a.startsWith('GatesRun')) return to.gates === 'success' ? 'gates G0 to G7 pass' : 'a gate fails [or no agent patch]';
  if (a.startsWith('GatesSkipped')) return 'gates job is skipped';
  if (a.startsWith('PushRun')) return to.push === 'success' ? (to.output === 'tests' ? 'push to PR branch succeeds' : 'safe output runs with nothing to push') : 'push to PR branch fails';
  if (a.startsWith('PushSkipped')) return 'safe output job is skipped';
  if (a.startsWith('ReportPublishes')) return 'report job posts comment and check';
  if (a.startsWith('ReportCrashes')) return 'report job fails, fallback step posts';
  if (a.startsWith('ReportSkipped')) return 'report job is skipped';
  if (a.startsWith('BlockedPublishes')) return 'report_blocked posts comment and check';
  if (a.startsWith('BlockedNoop')) return 'report_blocked job ends without posting';
  return a;
};

export const group = (v) => {
  if (v.cancelled) return 'cancelled';
  if (v.report === 'done' || (v.blocked === 'done' && v.detection === 'failure')) return 'reported';
  if (v.report === 'skipped') return 'silent';
  return 'running';
};

export const colors = { running: 'blue', reported: 'teal', silent: 'pink', cancelled: 'tan' };
