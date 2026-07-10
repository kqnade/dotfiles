# Project Maker — ghq + mise + template 対話式プロジェクト作成
# Usage: pm

pm() {
  # ── gh 認証確認 ───────────────────────────────────────────
  local gh_user=""
  if command -v gh >/dev/null 2>&1; then
    gh_user=$(gh api user -q .login 2>/dev/null)
  fi

  # ── 1. Project name ──────────────────────────────────────
  local name=""
  while [[ -z "$name" ]]; do
    read -r "name?Project name: "
  done

  # ── 2. Owner ─────────────────────────────────────────────
  local owner="${PM_DEFAULT_OWNER:-$gh_user}"
  local owner_input=""
  read -r "owner_input?Owner (default: ${owner:-none}): "
  [[ -n "$owner_input" ]] && owner="$owner_input"
  if [[ -z "$owner" ]]; then
    echo "Owner is required." >&2
    return 1
  fi

  # ── 3. Visibility (fzf or select) ────────────────────────
  local visibility="private"
  if command -v fzf >/dev/null 2>&1; then
    visibility=$(echo -e "public\nprivate\ninternal" | fzf --height=5 --prompt="Visibility> ")
  else
    echo "Visibility:"
    select v in public private internal; do
      visibility="$v"
      break
    done
  fi
  visibility=${visibility:-private}

  # ── 4. Description ───────────────────────────────────────
  local desc=""
  read -r "desc?Description (optional): "

  # ── 5. Template selection ────────────────────────────────
  local tmpl_dir="$HOME/.config/project-maker/templates"
  if [[ ! -d "$tmpl_dir" ]]; then
    echo "Template directory not found: $tmpl_dir" >&2
    return 1
  fi

  local template=""
  if command -v fzf >/dev/null 2>&1; then
    template=$(ls "$tmpl_dir" | fzf --height=15 --prompt="Select template> ")
  else
    echo "Select template:"
    select t in $(ls "$tmpl_dir"); do
      template="$t"
      break
    done
  fi
  if [[ -z "$template" ]]; then
    echo "No template selected." >&2
    return 1
  fi

  # ── 6. Create GitHub repo (if gh available) ────────────────
  local repo_slug="${owner}/${name}"
  local clone_url="https://github.com/${repo_slug}.git"

  if command -v gh >/dev/null 2>&1 && [[ -n "$gh_user" ]]; then
    echo "Creating GitHub repo ${repo_slug} (${visibility})..."
    gh repo create "${repo_slug}" \
      --"${visibility}" \
      ${desc:+--description="$desc"} \
      --confirm
  else
    echo "gh not available. Skipping GitHub repo creation."
  fi

  # ── 7. Clone into ghq root ─────────────────────────────────
  local project_path=""
  if command -v ghq >/dev/null 2>&1; then
    echo "Cloning into ghq root..."
    ghq get "${clone_url}"
    project_path=$(ghq list --full-path --exact "${clone_url}" 2>/dev/null)
  else
    echo "ghq not available. Creating directory manually..."
    local ghq_root="${GHQ_ROOT:-$HOME/repos}"
    project_path="${ghq_root}/github.com/${repo_slug}"
    mkdir -p "${project_path%/*}"
    git init "${project_path}"
  fi

  if [[ -z "$project_path" || ! -d "$project_path" ]]; then
    echo "Failed to locate project directory." >&2
    return 1
  fi

  # ── 8. Copy template ──────────────────────────────────────
  echo "Copying template (${template})..."
  cp -R "${tmpl_dir}/${template}/." "${project_path}/"

  # ── 9. Replace placeholders ──────────────────────────────
  find "$project_path" -type f -print0 | while IFS= read -r -d '' file; do
    if grep -qE '{{PROJECT_NAME}}|{{OWNER}}|{{DESCRIPTION}}' "$file" 2>/dev/null; then
      perl -pi -e "s/\\Q{{PROJECT_NAME}}\\E/${name}/g" "$file"
      perl -pi -e "s/\\Q{{OWNER}}\\E/${owner}/g" "$file"
      perl -pi -e "s/\\Q{{DESCRIPTION}}\\E/${desc}/g" "$file"
    fi
  done

  # ── 10. Language-specific init ───────────────────────────
  case "$template" in
    go)
      (cd "$project_path" && go mod init "github.com/${owner}/${name}")
      ;;
    rust)
      (cd "$project_path" && cargo init --name "${name}")
      ;;
    typescript)
      (cd "$project_path" && pnpm init)
      ;;
    python)
      (cd "$project_path" && uv init --name "${name}")
      ;;
    ruby)
      (cd "$project_path" && bundle init && perl -pi -e "s/\\Q{{PROJECT_NAME}}\\E/${name}/g" Gemfile)
      ;;
    java)
      (cd "$project_path" && mvn archetype:generate \
        -DgroupId="com.${owner}" \
        -DartifactId="${name}" \
        -DarchetypeArtifactId=maven-archetype-quickstart \
        -DinteractiveMode=false 2>/dev/null || true)
      ;;
    kotlin)
      (cd "$project_path" && gradle init --type kotlin-application --dsl kotlin \
        --project-name "${name}" --package "com.${owner}" 2>/dev/null || true)
      ;;
  esac

  # ── 11. cd ────────────────────────────────────────────────
  echo "Done. cd ${project_path}"
  cd "${project_path}" || return 1
}
