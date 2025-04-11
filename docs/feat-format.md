# Custom Commit Message Format Feature

## Overview
Add support for customizable commit message format using a template string pattern with dynamic variable prompting.

## Format Specification
- Format template example: `{type} ({context}) {msg} (#{gitBranch})`
- System Variables (automatically handled):
  - `{type}`: Commit type (feat, fix, docs, etc.)
  - `{gitBranch}`: Current git branch name
- Custom Variables:
  - Any variable in format `{variableName}` will prompt user for description
  - Example: `{context}` will prompt user to describe what context means

## Configuration

### Storage
- File: `.commiat` in working directory (cwd)
- Format: JSON
- Content Structure:
  ```json
  {
    "format": "{type} ({context}) {msg} (#{gitBranch})",
    "variables": {
      "context": "affected app module such as location-module, events-module, alerts-module, etc"
    }
  }
  ```

### Variable Handling
1. System variables (`type`, `gitBranch`): Handled automatically
2. Custom variables: CLI prompts for description on first use
3. All variable descriptions are stored in config and sent to LLM

## Implementation Plan

### 1. Configuration Management
- Create module `src/config.js`
  - Function: `loadConfig()`: Read .commiat config
  - Function: `saveConfig(config)`: Save/update config
  - Function: `validateConfig(config)`: Validate structure

### 2. Variable Processing
- Create module `src/variables.js`
  - Function: `detectVariables(format)`: Extract all variables from format
  - Function: `promptForVariables(variables, config)`: Interactive CLI prompts
  - Function: `getSystemVariables()`: Get type and gitBranch

### 3. Git Integration
- Create module `src/utils/git.js`
  - Function: `getGitBranch()`: Get current branch
  - Add debug logs and error handling

### 4. LLM Integration
- Update system prompt to include:
  - Format template
  - All variable descriptions
  - Clear instructions about variable placement
- Validate LLM output matches format

### 5. Error Handling
- Validate config file structure
- Handle missing git branch
- Add debug logs for all operations

## Example Usage

### First Run (No Config)
```bash
$ commiat
# CLI detects no .commiat file
? Enter commit message format: {type} ({context}) {msg} (#{gitBranch})
? Describe what you expect for {context}: affected app module such as location-module, events-module
# Config saved to .commiat
```

### Subsequent Runs
```bash
$ commiat
# Uses existing format and variable descriptions
# Only prompts for commit message
```

### Example Output
```
feat (auth-module) add OAuth support (#feature/oauth)
```# feat (auth) add login form (#feature/login)
```

## Testing Plan
1. Test format processing with different templates
2. Test git branch detection in various states
3. Test error handling for invalid formats
4. Test LLM output compliance with format
