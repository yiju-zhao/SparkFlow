#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the bump type from argument (patch, minor, major)
BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'. Use: patch, minor, or major${NC}"
  exit 1
fi

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}Warning: You're on '$CURRENT_BRANCH', not 'main'.${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Ensure working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: Working directory is not clean. Commit or stash changes first.${NC}"
  exit 1
fi

# Get current version from apps/web/package.json
CURRENT_VERSION=$(node -p "require('./apps/web/package.json').version")
echo -e "Current version: ${YELLOW}v$CURRENT_VERSION${NC}"

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "${CURRENT_VERSION%-*}"  # Remove -beta suffix if present
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $BUMP_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH-beta"
echo -e "New version: ${GREEN}v$NEW_VERSION${NC}"

# Confirm
read -p "Proceed with release? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Update package.json
echo -e "${YELLOW}Updating apps/web/package.json...${NC}"
cd apps/web
npm version "$NEW_VERSION" --no-git-tag-version
cd ../..

# Update README badge (shields.io requires -- for hyphens)
echo -e "${YELLOW}Updating README.md version badge...${NC}"
BADGE_VERSION="${NEW_VERSION//-/--}"  # Replace - with -- for shields.io
sed -i '' "s|version-[0-9.]*--*[a-z]*-blue|version-${BADGE_VERSION}-blue|g" README.md

# Commit version bump
echo -e "${YELLOW}Committing version bump...${NC}"
git add apps/web/package.json README.md
git commit -m "chore: bump version to v$NEW_VERSION"

# Create tag
echo -e "${YELLOW}Creating tag v$NEW_VERSION...${NC}"
git tag "v$NEW_VERSION"

# Push commit and tag
echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

# Create GitHub release
echo -e "${YELLOW}Creating GitHub release...${NC}"
gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --generate-notes

echo -e "${GREEN}Released v$NEW_VERSION${NC}"
echo -e "View release: ${YELLOW}$(gh release view "v$NEW_VERSION" --json url -q .url)${NC}"
