# Non-Interactive Mode Implementation Plan

## Overview
Add a `--non-interactive` flag to commiat that disables all user prompts and automatically commits with the generated message. This mode should work with `--multi` and disable cloud lead capture.

## Current Interactive Behavior Analysis

### Interactive Prompts Identified:
1. **API Key Prompt** (`promptForApiKey` - line 164) - Only when API key missing
2. **Config Creation Prompt** (`config.js` line 34) - When `.commiat` file missing
3. **Staging Prompt** (`mainAction` line 648) - "No changes staged. Stage all changes now?"
4. **Commit Message Confirmation** (`promptUser` line 502) - Main commit approval loop
5. **Lead Capture Prompt** (`promptForLead` line 561) - Cloud product interest
6. **Variable Description Prompts** (`variables.js` line 77) - For custom format variables
7. **Multi-commit Default Setting** (line 1229) - When using `--multi` flag

## Implementation Plan

### 1. Add CLI Flag ✅
- Added `--non-interactive` option to program definition
- Pass the option through to all relevant functions

### 2. Modify Core Functions ✅

#### `promptUser` Function (line 499)
- **Current**: Shows interactive confirmation loop
- **Non-interactive**: Return the initial message directly without prompting
- **Behavior**: Auto-accept generated commit message

#### `promptForLead` Function (line 540)
- **Current**: Shows lead capture prompts with weekly cooldown
- **Non-interactive**: Return early without any prompts
- **Behavior**: Completely disable lead capture

#### Staging Logic (line 658)
- **Current**: Prompts to stage all changes if none staged
- **Non-interactive**: Default to staging all changes automatically
- **Behavior**: Auto-stage changes when needed

#### Config Creation (config.js line 36)
- **Current**: Prompts to create `.commiat` file
- **Non-interactive**: Use default format without prompting
- **Behavior**: Proceed with default `{type}: {msg}` format

#### Variable Descriptions (variables.js line 67)
- **Current**: Prompts for missing variable descriptions
- **Non-interactive**: Skip variable descriptions, use empty descriptions
- **Behavior**: Generate commits without custom variable guidance

### 3. Multi-Commit Mode Integration ✅
- `handleMultiCommit` respects non-interactive mode
- Auto-accept all grouped commit messages
- Disable any interactive prompts in the grouping process

### 4. Error Handling ✅
- In non-interactive mode, fail gracefully when essential info is missing
- Provide clear error messages instead of prompts
- Exit with appropriate error codes

## Implementation Details

### Function Signatures Updated ✅
```javascript
async function promptUser(initialMessage, nonInteractive = false)
async function promptForLead(nonInteractive = false)
async function loadConfig(nonInteractive = false)
async function promptForMissingVariableDescriptions(variables, config, nonInteractive = false)
```

### Key Behavior Changes ✅
1. **API Key**: Still required, but won't prompt - fail with clear error
2. **Config**: Use defaults without prompting
3. **Staging**: Auto-stage changes when needed
4. **Commit**: Auto-accept generated messages
5. **Lead Capture**: Completely disabled
6. **Multi-commit**: Process all groups without confirmation

## Testing Results ✅

### Test Scenario 1: Basic non-interactive commit
- **Status**: ✅ PASS
- **Result**: Successfully auto-committed without prompts
- **Lead Capture**: Disabled as expected

### Test Scenario 2: Non-interactive with `--multi`
- **Status**: ✅ PASS  
- **Result**: Successfully processed multiple groups without confirmation
- **Auto-staging**: Worked correctly
- **Lead Capture**: Disabled as expected

### Test Scenario 3: Help output verification
- **Status**: ✅ PASS
- **Result**: `--non-interactive` flag appears correctly in help

## Files Modified

1. **src/cli.js**
   - Added `--non-interactive` CLI option
   - Modified `promptUser()` and `promptForLead()` functions
   - Updated staging logic for auto-staging
   - Updated all function calls to pass non-interactive flag

2. **src/config.js**
   - Modified `loadConfig()` to handle non-interactive mode
   - Added default config creation without prompting

3. **src/variables.js**
   - Modified `promptForMissingVariableDescriptions()` to skip prompts
   - Added empty description initialization for non-interactive mode

## Backward Compatibility ✅
- All existing functionality preserved when flag not used
- Default behavior remains interactive
- No breaking changes to existing workflows

## Final Implementation Status: COMPLETE ✅

The non-interactive mode has been successfully implemented and tested. All interactive prompts have been properly handled, cloud lead capture is disabled in non-interactive mode, and the feature works seamlessly with the `--multi` flag.
