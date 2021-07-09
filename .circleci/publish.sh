#!/bin/bash -e
if [ -z "$CIRCLE_PULL_REQUEST" ]; then
  git config --global user.email $GITHUB_EMAIL
  git config --global user.name $GITHUB_USER
  if [[ "$CIRCLE_BRANCH" =~ ^tagged-release\/.* ]]; then
    # Remove tagged-release/
    export NPM_TAG="${CIRCLE_BRANCH/tagged-release\//}"
    # Remove /no-e2e-tests
    export NPM_TAG="${NPM_TAG/\/no-e2e-tests/}"
    if [ -z "$NPM_TAG" ]; then
      echo "Tag name is missing. Name your banch with tagged-release/<tag-name>"
      exit 1
    fi
    echo "Publishing to NPM with tag $NPM_TAG"
    yarn publish:tag
  else
    yarn publish:$CIRCLE_BRANCH
  fi
else
  echo "Skipping deploy."
fi