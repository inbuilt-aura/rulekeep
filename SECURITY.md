# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's private
vulnerability reporting for this repository. Do not open a public issue with
details that could help someone exploit a vulnerability.

If private reporting is unavailable, contact the repository owner through the
email address listed on the owner's GitHub profile and include "rulekeep
security" in the subject.

## Scope and limitations

rulekeep runs locally and does not make network calls. Checker rules run local
commands only after the user explicitly trusts them. rulekeep is a development
guardrail, not a security sandbox: an agent or process with shell access can
always bypass a local hook.

Please include the rulekeep version, operating system, affected command or
configuration, and a minimal reproduction in a private report.