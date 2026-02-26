# set-default-model.sh

A bash script to quickly update the default OpenRouter model across the Commiat codebase.

## Usage

```bash
./scripts/set-default-model.sh <model-id>
```

## Examples

### Set to liquid/lfm-2-24b-a2b (current default)
```bash
./scripts/set-default-model.sh "liquid/lfm-2-24b-a2b"
```

### Set to openrouter/free
```bash
./scripts/set-default-model.sh "openrouter/free"
```

### Set to Google Gemini
```bash
./scripts/set-default-model.sh "google/gemini-2.5-flash"
```

### Set to Claude (via OpenRouter)
```bash
./scripts/set-default-model.sh "anthropic/claude-3.5-sonnet"
```

## What it does

The script automatically updates:

1. **src/cli.js**
   - `DEFAULT_OPENROUTER_MODEL` constant
   - `model select` command description (Recommended model)

2. **docs/index.html**
   - All references to the model in hero section
   - Feature descriptions
   - Configuration examples
   - Setup guide sections
   - All inline code blocks with model names

## Output

The script provides colored output showing:
- Current model vs. new model
- Files being updated
- Verification results
- Count of model references in docs

## Example Output

```bash
$ ./scripts/set-default-model.sh "openrouter/free"

🔄 Updating default model to: openrouter/free

Current model: liquid/lfm-2-24b-a2b
New model: openrouter/free

📝 Updating src/cli.js...
✅ Updated DEFAULT_OPENROUTER_MODEL constant
✅ Updated model select command description

📝 Updating docs/index.html...
✅ Updated model references in HTML

✅ Verification
CLI file - Default model: openrouter/free
Docs file - Model references: 7

🎉 Update complete! Made 5 changes.

📌 Next steps:
   • Test the model with: commiat config -t
   • Verify all changes: grep -r "openrouter/free" src/ docs/
   • Review changes: git diff
   • Commit: git add -A && git commit -m "chore: set default model to openrouter/free"
```

## Requirements

- bash 4.0+
- sed
- grep

## Notes

- The script creates `.bak` backup files during sed operations and automatically removes them
- All changes are made to actual files (not dry-run mode)
- Always review changes with `git diff` before committing
- Test the new model with `commiat config -t` to ensure connectivity

## Error Handling

The script will exit with an error if:
- No model ID is provided
- `src/cli.js` is not found
- `docs/index.html` is not found

## Tips

After running the script:

```bash
# Review all changes
git diff

# Test the model connectivity
commiat config -t

# Verify all references are updated
grep -r "your-new-model-id" src/ docs/

# Commit the changes
git add -A && git commit -m "chore: set default model to your-new-model-id"
```
