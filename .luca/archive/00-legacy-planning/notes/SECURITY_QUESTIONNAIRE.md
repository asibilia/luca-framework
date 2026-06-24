# Luca Framework Security Questionnaire

This document provides answers to common security questions for enterprise procurement and security teams evaluating the Luca Framework.

## 1. General Information

| Question | Answer |
|----------|--------|
| Product Name | Luca Framework |
| Version | 0.1.0+ |
| Primary Function | AI-Native Developer Productivity Framework |
| Deployment Model | Client-side CLI / Developer Tool |

## 2. Data Security & Privacy

### 2.1 Where is data stored?
All core project data, including planning documents, state, and source code, is stored locally within the user's repository. Luca Framework does not maintain a centralized database.

### 2.2 Does Luca Framework exfiltrate source code?
No. Luca Framework operates locally. Source code is only sent to external services (like GitHub or Jira) if the user explicitly configures and uses the corresponding adapters.

### 2.3 How are API keys and secrets handled?
Luca Framework recommends using environment variables for sensitive credentials. The framework itself does not store secrets in plain text. Users are responsible for ensuring that `.env` files are included in `.gitignore`.

### 2.4 Is data encrypted at rest?
Data at rest is subject to the encryption policies of the host machine and the repository hosting service (e.g., GitHub, GitLab).

## 3. Application Security

### 3.1 How are vulnerabilities managed?
We perform regular automated scanning of our dependency tree. Vulnerabilities are triaged and patched as part of our standard release cycle.

### 3.2 Is there a vulnerability disclosure program?
Yes. We have a responsible disclosure policy outlined in our [SECURITY.md](../SECURITY.md).

### 3.3 Does the application require administrative privileges?
No. Luca Framework runs as a standard user process within the developer's environment.

## 4. Supply Chain Security

### 4.1 How are dependencies managed?
Dependencies are managed via Bun/npm and are pinned to specific versions. We strive for a minimal dependency footprint.

### 4.2 Are dependencies scanned for vulnerabilities?
Yes, we use automated tools to monitor our dependency tree for known CVEs.

### 4.3 Is the build process secure?
Our build and release process is automated via CI/CD pipelines with restricted access and mandatory code reviews.

## 5. Compliance & Audit

### 5.1 Is Luca Framework SOC 2 compliant?
While the framework itself is a tool, our development processes align with SOC 2 Type II principles regarding access control, change management, and monitoring.

### 5.2 Does Luca Framework provide audit logs?
Yes. Every action taken by the framework is recorded in:
1. **Git Commits**: Atomic commits for every task.
2. **Execution Summaries**: Detailed reports in `.planning/phases/`.
3. **State Tracking**: Continuous state updates in `.planning/STATE.md`.

## 6. Access Control

### 6.1 How is access to the tool managed?
Access is managed via the host operating system and the version control system (e.g., GitHub organization permissions).

### 6.2 Does Luca Framework support SSO?
Luca Framework integrates with the authentication mechanisms of the platforms it connects to (e.g., GitHub CLI auth, Jira API tokens).

---
*Last Updated: 2026-02-05*
