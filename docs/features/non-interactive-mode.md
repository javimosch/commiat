# Non-Interactive Mode

## Overview
The `--non-interactive` flag enables automated commit generation without any user prompts. This mode is designed for CI/CD pipelines, scripts, and automated workflows where human interaction is not possible or desired.

## Usage
```bash
commiat --non-interactive
```

Can be combined with other flags:
```bash
commiat --non-interactive --multi
commiat --non-interactive --add-all
commiat --non-interactive --prefix "[WIP]"
```

## Behavior

### Interactive Prompts Disabled
When `--non-interactive` is enabled, the following prompts are automatically handled:

1. **Commit Message Confirmation**: Auto-accepts the AI-generated commit message
2. **Staging Prompt**: Automatically stages all changes when no files are staged
3. **Lead Capture**: Completely disabled - no marketing prompts
4. **Config Creation**: Uses default format without prompting
5. **Variable Descriptions**: Uses empty descriptions for custom variables

### Auto-Staging
If no changes are staged, the tool automatically runs `git add .` to stage all changes.

### Default Configuration
When no `.commiat` config file exists, the tool uses the default format `{type}: {msg}` without prompting for creation.

## Multi-Commit Mode
The `--non-interactive` flag works seamlessly with `--multi`:

- Groups changes into logical commits using AI analysis
- Auto-accepts all grouped commit messages
- Processes each group without confirmation
- Disables lead capture for the entire process

## Error Handling
In non-interactive mode:
- Missing API keys result in clear error messages and exit
- Invalid configurations fail with descriptive errors
- No fallback to interactive prompts

## Exit Codes
- `0`: Success - commit(s) created
- `1`: Error - no changes, API issues, or configuration problems

## Examples

### Basic Non-Interactive Commit
```bash
# Stage changes and commit automatically
git add .
commiat --non-interactive
```

### Non-Interactive Multi-Commit
```bash
# Group related changes into multiple commits automatically
commiat --non-interactive --multi
```

### CI/CD Pipeline Integration
```bash
# In a CI/CD script
commiat --non-interactive --add-all --no-verify
```

## Configuration
The mode respects existing configuration files but will use defaults when they don't exist, ensuring no prompts interrupt automated workflows.

## Compatibility
- Works with all existing flags
- Fully backward compatible
- No changes to default interactive behavior when flag is not used
