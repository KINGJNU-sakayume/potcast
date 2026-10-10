#!/usr/bin/env bash
# The narration store in GitHub Actions: the repository's `narration` branch, checked out to .narration.
# It holds every clip ever rendered (see scripts/narration/render.ts) and nothing else; it shares no history
# with main and is only ever added to.
#
#   store.sh fetch   check the branch out, or start an empty store when it does not exist yet
#   store.sh push    commit the clips rendered in this run and push them
#
# Needs GITHUB_TOKEN (with contents: write for `push`) and GITHUB_REPOSITORY, as a workflow has them;
# NARRATION_REMOTE names another repository to use instead (for trying the script out).
set -euo pipefail

BRANCH=narration
DIR=.narration
REMOTE="${NARRATION_REMOTE:-https://x-access-token:${GITHUB_TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"

case "${1:-}" in
  fetch)
    rm -rf "$DIR"
    if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
      git clone --quiet --depth 1 --branch "$BRANCH" "$REMOTE" "$DIR"
      echo "Fetched the store: $(find "$DIR/clips" -name '*.mp3' 2>/dev/null | wc -l) clips."
    else
      git init --quiet --initial-branch "$BRANCH" "$DIR"
      git -C "$DIR" remote add origin "$REMOTE"
      cat > "$DIR/README.md" <<'README'
# Narration store

The hosts' lines of potcast's episodes as recorded clips (Supertonic 3), written by the `narration` steps of
the workflows on `main`. Every clip is `clips/<aa>/<key>.mp3` with a `<key>.json` beside it that says which
voice says what. Nothing here is edited by hand, and the branch shares no history with `main`.

The voices are machine-generated.
README
      echo "Started an empty store."
    fi
    ;;
  push)
    cd "$DIR"
    git add -A
    if git diff --cached --quiet; then
      echo "Nothing new to store."
      exit 0
    fi
    added=$(git diff --cached --name-only --diff-filter=A | grep -c '\.mp3$' || true)
    git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
      commit --quiet -m "Narration: ${added} new clips"
    # Another run may have pushed in the meantime. Clips never share a file, so a rebase cannot conflict.
    for attempt in 1 2 3 4; do
      if git push --quiet origin "HEAD:${BRANCH}"; then
        echo "Stored ${added} new clips."
        exit 0
      fi
      echo "Push ${attempt} was rejected; rebasing on the store and trying again."
      git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
        pull --quiet --rebase origin "$BRANCH"
    done
    echo "Could not push the new clips." >&2
    exit 1
    ;;
  *)
    echo "usage: store.sh fetch|push" >&2
    exit 2
    ;;
esac
