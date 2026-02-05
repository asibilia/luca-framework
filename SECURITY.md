# Security Policy

## Security Posture

Luca Framework is designed with enterprise security as a first-class citizen. Our security posture is built on the principles of least privilege, transparency, and secure supply chain management.

### SOC 2 Type II Alignment

While Luca Framework is a client-side developer tool, we align our internal development processes and the framework's architecture with SOC 2 Type II security principles. This includes:
- **Logical Access Control**: Strict access controls for repository maintainers.
- **Change Management**: Mandatory code reviews and automated security scanning for all changes.
- **System Monitoring**: Continuous monitoring of dependencies for vulnerabilities.

### Supply Chain Security

We take supply chain security seriously to ensure the integrity of the Luca Framework:
- **Dependency Pinning**: All dependencies are pinned to specific versions to prevent unexpected changes.
- **Automated Scanning**: We use automated tools to scan for known vulnerabilities (CVEs) in our dependency tree.
- **Minimal Footprint**: We strive to keep our dependency tree as small as possible to reduce the attack surface.

### Data Handling & Privacy

Luca Framework operates primarily on your local machine.
- **Local Execution**: All core logic runs locally within your development environment.
- **No Data Exfiltration**: Luca does not send your source code or sensitive data to external servers unless explicitly configured via third-party adapters (e.g., Jira, GitHub).
- **Credential Management**: We recommend using environment variables or secure secret managers for API keys. Luca never stores credentials in plain text within the repository.

### Audit Trails

Luca Framework facilitates auditability for your development process:
- **Structured Planning**: All architectural decisions and plan executions are documented in `.planning/`.
- **Git Integration**: Every action taken by Luca is traceable through atomic Git commits.
- **Summary Reports**: Execution summaries provide a clear record of what was changed, by whom, and why.

## Reporting a Vulnerability

We appreciate the work of security researchers and the community in keeping Luca Framework secure.

### Responsible Disclosure

If you discover a security vulnerability, please follow these steps:
1. **Do not disclose publicly**: Avoid sharing details of the vulnerability in public issues or forums until it has been addressed.
2. **Report via Email**: Send a detailed report to `security@luca-framework.dev`.
3. **Include Details**: Provide a clear description of the vulnerability, steps to reproduce, and potential impact.

### Our Commitment

- **Acknowledgement**: We will acknowledge receipt of your report within 48 hours.
- **Triage**: We will investigate and triage the vulnerability promptly.
- **Remediation**: We will work to provide a fix or mitigation as quickly as possible.
- **Credit**: We will provide credit to the researcher once the vulnerability is resolved, if desired.

## Security Questionnaire

For enterprise procurement and security teams, we provide a self-service security questionnaire template.

**See:** [.planning/SECURITY_QUESTIONNAIRE.md](.planning/SECURITY_QUESTIONNAIRE.md)
