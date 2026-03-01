# Commit

Create a git commit for the current changes following the project's conventional commit style.

## Steps

1. Run `git status` to see untracked and modified files
2. Run `git diff HEAD` to review all staged and unstaged changes
3. Run `git log --oneline -10` to match the existing commit message style
4. Analyze the changes and draft a commit message:
   - Use conventional commit format: `type(scope): description`
   - Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
   - Keep the subject line under 72 characters
   - Add a body only if the change is non-obvious
   - End with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. Stage the relevant files (be specific — avoid `git add .` if sensitive files might be present)
6. Commit with the drafted message
7. Run `git status` to confirm success

## Rules

- Do NOT push to remote
- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT amend existing commits — always create a new commit
- Do NOT commit `.env` files or secrets
- If `$ARGUMENTS` is provided, use it as a hint for the commit scope or message

## Example message format

```
feat(training): add 2x2 mode picker to TrainingPage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
