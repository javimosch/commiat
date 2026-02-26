#!/bin/bash

# Script to quickly update the default OpenRouter model across the codebase
# Usage: ./set-default-model.sh <model-id>
# Example: ./set-default-model.sh "liquid/lfm-2-24b-a2b"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths to files to update
CLI_FILE="src/cli.js"
DOCS_FILE="docs/index.html"

# Check if model argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Model ID not provided${NC}"
    echo "Usage: $0 <model-id>"
    echo "Example: $0 'liquid/lfm-2-24b-a2b'"
    echo "Example: $0 'openrouter/free'"
    echo "Example: $0 'google/gemini-2.5-flash'"
    exit 1
fi

NEW_MODEL="$1"

# Validate that files exist
if [ ! -f "$CLI_FILE" ]; then
    echo -e "${RED}❌ Error: $CLI_FILE not found${NC}"
    exit 1
fi

if [ ! -f "$DOCS_FILE" ]; then
    echo -e "${RED}❌ Error: $DOCS_FILE not found${NC}"
    exit 1
fi

echo -e "${BLUE}🔄 Updating default model to: ${GREEN}${NEW_MODEL}${NC}\n"

# Store the current model for comparison
CURRENT_MODEL=$(grep "const DEFAULT_OPENROUTER_MODEL" "$CLI_FILE" | sed 's/.*"\(.*\)".*/\1/')
echo -e "${BLUE}Current model: ${YELLOW}${CURRENT_MODEL}${NC}"
echo -e "${BLUE}New model: ${GREEN}${NEW_MODEL}${NC}\n"

# Counter for changes
CHANGES=0

echo -e "${BLUE}📝 Updating src/cli.js...${NC}"

# Escape forward slashes for sed
ESCAPED_MODEL=$(printf '%s\n' "$NEW_MODEL" | sed 's/[\/&]/\\&/g')

# Update DEFAULT_OPENROUTER_MODEL constant
# Pattern: const DEFAULT_OPENROUTER_MODEL = "anything";
if sed -i.bak "s|const DEFAULT_OPENROUTER_MODEL = \"[^\"]*\"|const DEFAULT_OPENROUTER_MODEL = \"${ESCAPED_MODEL}\"|g" "$CLI_FILE"; then
    echo -e "${GREEN}✅ Updated DEFAULT_OPENROUTER_MODEL constant${NC}"
    rm -f "${CLI_FILE}.bak"
    ((CHANGES++))
else
    rm -f "${CLI_FILE}.bak"
fi

# Update model select command description - FIXED pattern to preserve closing quote
# Pattern: .description("Select an OpenRouter model using autocomplete search. Recommended: anything")
if sed -i.bak "s|\"Select an OpenRouter model using autocomplete search\. Recommended: [^\"]*\"|\"Select an OpenRouter model using autocomplete search. Recommended: ${ESCAPED_MODEL}\"|g" "$CLI_FILE"; then
    echo -e "${GREEN}✅ Updated model select command description${NC}"
    rm -f "${CLI_FILE}.bak"
    ((CHANGES++))
else
    rm -f "${CLI_FILE}.bak"
fi

echo ""
echo -e "${BLUE}📝 Updating docs/index.html...${NC}"

# Replace old models with new model
if sed -i.bak "s/liquid\/lfm-2-24b-a2b/${ESCAPED_MODEL}/g" "$DOCS_FILE"; then
    rm -f "${DOCS_FILE}.bak"
    ((CHANGES++))
fi

if sed -i.bak "s/google\/gemini-2\.5-flash-lite/${ESCAPED_MODEL}/g" "$DOCS_FILE"; then
    rm -f "${DOCS_FILE}.bak"
    ((CHANGES++))
fi

# Replace in OPENROUTER_MODEL configuration examples
if sed -i.bak "s/OPENROUTER_MODEL=[^ <]*/OPENROUTER_MODEL=${ESCAPED_MODEL}/g" "$DOCS_FILE"; then
    rm -f "${DOCS_FILE}.bak"
    ((CHANGES++))
fi

echo -e "${GREEN}✅ Updated model references in HTML${NC}"

echo ""
echo -e "${BLUE}✅ Verification${NC}"

# Verify changes
NEW_CLI_MODEL=$(grep "const DEFAULT_OPENROUTER_MODEL" "$CLI_FILE" | sed 's/.*"\(.*\)".*/\1/')
echo -e "CLI file - Default model: ${GREEN}${NEW_CLI_MODEL}${NC}"

MODEL_COUNT=$(grep -o "$NEW_MODEL" "$DOCS_FILE" 2>/dev/null | wc -l || echo 0)
echo -e "Docs file - Model references: ${GREEN}${MODEL_COUNT}${NC}"

# Check syntax
if node -c "$CLI_FILE" 2>/dev/null; then
    echo -e "Syntax check: ${GREEN}✅ Valid${NC}"
else
    echo -e "Syntax check: ${RED}❌ Invalid${NC}"
    echo -e "${YELLOW}Please review the changes with: git diff${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Update complete! Made ${CHANGES} changes.${NC}"
echo ""
echo -e "${YELLOW}📌 Next steps:${NC}"
echo "   • Test the model with: commiat config -t"
echo "   • Verify all changes: grep -r \"${NEW_MODEL}\" src/ docs/"
echo "   • Review changes: git diff"
echo "   • Commit: git add -A && git commit -m \"chore: set default model to ${NEW_MODEL}\""
