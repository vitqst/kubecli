# KubeCLI Coding Agent Guide

This guide helps new contributors―human or AI―spin up quickly and begin writing code for the Kubernetes CLI Manager project.

## 1. Understand the Problem Space

- Read `docs/ai/BASE.md` for the product overview, tech stack, and basic workflows.
- Collect task context from issues, pull requests, or user prompts. Clarify requirements before touching code.
- Note any acceptance criteria or test expectations up front.

## 2. Prepare the Environment

- Install Node.js (LTS release such as 18 or 20) and npm.
- From the repository root run:
  ```bash
  npm install
  ```
- If you need a local Kubernetes API, follow the Minikube flow in `docs/ai/BASE.md`.
- Verify `kubectl config get-contexts` sees the cluster you plan to target.

## 3. Explore the Codebase

- Skim the project structure (`src/`, `electron/`, configuration files) to understand where features live.
- Search for existing patterns before adding new ones; align with established React/Electron conventions.
- Identify relevant TypeScript types, hooks, and state management utilities before implementing changes.

## 4. Plan Before Writing Code

- Break the task into small, testable steps.
- Decide how you will validate behavior (unit tests, integration tests, manual UI checks).
- Create or update design notes if architecture changes are required.

## 5. Implement Changes

- Keep changes minimal and focused on the task.
- Add or update tests alongside code when feasible.
- Include concise comments only when the intent is non-obvious.

## 6. Validate

- Run linting or formatting scripts (`npm run lint`, `npm run format`, etc.) if available.

## 6.1 Troubleshooting

- When I prompt `check the errors` or something like that please do this step to debug and capture error automatically:
- Launch the app locally with `eval 'pkill -9 -f electron; rm -rf .webpack; ./check-errors.sh'` and exercise the impacted workflow.
- Capture any manual verification notes (commands run, screenshots) for reviewers.

## 7. Wrap Up

- Update documentation when behavior changes (README, `docs/`, inline docs).

Following these steps keeps contributions predictable, testable, and easy for teammates to review.
