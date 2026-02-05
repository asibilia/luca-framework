# Getting Started with Luca

Welcome to Luca! This guide will walk you through setting up your first project and understanding the core workflow.

## Prerequisites

- **Bun**: v1.0 or higher (Recommended)
- **Node.js**: v20 or higher
- **Git**: For version control and task tracking

## Installation

The easiest way to start a new Luca project is using `create-luca`:

```bash
npx create-luca my-new-project
cd my-new-project
bun install
```

## Core Concepts

### 1. The `.planning` Directory
All Luca projects have a `.planning/` directory at the root. This is where your project's "brain" lives.
- `STATE.md`: Tracks overall project progress and decisions.
- `PROJECT.md`: High-level project definition.
- `phases/`: Contains your development plans and summaries.

### 2. Plans (`PLAN.md`)
A plan is a structured markdown file that defines a specific set of tasks to be executed. It includes:
- **Objective**: What are we trying to achieve?
- **Tasks**: Atomic steps to reach the objective.
- **Verification**: How do we know it works?

### 3. Execution
The Luca CLI executes these plans, handling git commits for each task and managing deviations automatically.

## Your First Workflow

### Step 1: Define a Phase
Create a directory for your first phase:
```bash
mkdir -p .planning/phases/01-init
```

### Step 2: Create a Plan
Create `.planning/phases/01-init/01-01-PLAN.md`. You can use the templates in the framework directory as a starting point.

### Step 3: Execute the Plan
Run the execution command:
```bash
npx luca execute .planning/phases/01-init/01-01-PLAN.md
```

## Common Commands

| Command | Description |
|---------|-------------|
| `luca init` | Initialize a new Luca project in the current directory |
| `luca execute <path>` | Execute a specific plan file |
| `luca update` | Update the framework and templates to the latest version |
| `luca doctor` | Check your environment for common issues |

## Next Steps

- Explore the [Architecture](agent-framework/luca/architecture-plan.md)
- Learn about [Coding Standards](style-guide/coding-standards.md)
- If you run into issues, check the [Troubleshooting Guide](troubleshooting.md)
