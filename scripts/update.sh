#!/bin/bash
# Script to sync fork with upstream main branch
#
# Usage: ./scripts/update.sh [upstream_remote] [fork_remote] [branch]
# Defaults: upstream=upstream, fork=origin, branch=main

# Exit immediately if a command exits with a non-zero status
set -euo pipefail

# Configuration
UPSTREAM="${1:-upstream}"
FORK="${2:-origin}"
BRANCH="${3:-main}"

echo "=== Fork Sync Utility ==="
echo "Upstream remote: $UPSTREAM"
echo "Fork remote:     $FORK"
echo "Branch:          $BRANCH"
echo ""

# 1. Verify remotes exist or configure default ones
if ! git remote | grep -q "^$FORK$"; then
    if [ "$FORK" = "origin" ]; then
        echo "Adding default fork remote '$FORK' pointing to git@github.com:zenuhcomp/OpenConstructionERP.git..."
        git remote add "$FORK" "git@github.com:zenuhcomp/OpenConstructionERP.git"
    else
        echo "ERROR: Fork remote '$FORK' does not exist."
        echo "Available remotes:"
        git remote -v
        exit 1
    fi
fi

if ! git remote | grep -q "^$UPSTREAM$"; then
    if [ "$UPSTREAM" = "upstream" ]; then
        echo "Adding default upstream remote '$UPSTREAM' pointing to git@github.com:datadrivenconstruction/OpenConstructionERP.git..."
        git remote add "$UPSTREAM" "git@github.com:datadrivenconstruction/OpenConstructionERP.git"
    else
        echo "ERROR: Upstream remote '$UPSTREAM' does not exist."
        echo "Available remotes:"
        git remote -v
        exit 1
    fi
fi

# 2. Check for uncommitted changes
CHANGES_STASHED=false
if ! git diff-index --quiet HEAD --; then
    echo "Local repository has uncommitted changes. Stashing..."
    git stash -u
    CHANGES_STASHED=true
fi

# Save current branch
CURRENT_BRANCH=$(git branch --show-current)

# Ensure we return to the starting branch and restore stash if something fails
cleanup() {
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        echo "Returning to original branch: $CURRENT_BRANCH"
        git checkout "$CURRENT_BRANCH" --quiet
    fi
    if [ "$CHANGES_STASHED" = true ]; then
        echo "Restoring stashed changes..."
        git stash pop --quiet
    fi
}
trap cleanup EXIT

# 3. Fetch upstream changes
echo "Fetching changes from $UPSTREAM..."
git fetch "$UPSTREAM"

# 4. Checkout main branch
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "Checking out $BRANCH..."
    git checkout "$BRANCH"
fi

# 5. Merge changes from upstream/main
echo "Merging $UPSTREAM/$BRANCH into local $BRANCH..."
git merge "$UPSTREAM/$BRANCH" --no-edit

# 6. Push to fork
echo "Pushing merged changes to fork ($FORK/$BRANCH)..."
git push "$FORK" "$BRANCH"

echo ""
echo "=== Fork synced successfully! ==="
