# update

Update Luca to the latest version with changelog preview and migration notes.

## main

<main>
# Luca Update

Update Luca to latest version with changelog preview.

Better than raw `npx luca-framework` because it shows what's new.

## Process

1. **Check current version:**

   ```bash
   cat .cursor/luca/VERSION 2>/dev/null || echo "unknown"
   ```

2. **Check latest version:**
   - Query npm registry for latest version
   - Compare with current

3. **If update available:**
   - Fetch changelog entries for versions between current and latest
   - Highlight breaking changes
   - Present summary

4. **Confirm update:**

   ```
   ## Luca Update Available
   
   Current: v{current}
   Latest: v{latest}
   
   ### What's New
   
   **v{latest}**
   - {change 1}
   - {change 2}
   
   **v{previous}**
   - {change 3}
   
   ### Breaking Changes
   
   ⚠ {breaking change if any}
   
   ---
   
   Proceed with update? (y/n)
   ```

5. **If confirmed:**

   ```bash
   npx luca-framework@latest
   ```

6. **Verify:**
   - Check new VERSION file
   - Confirm success

## Success Criteria

- [ ] Current version detected
- [ ] Latest version checked
- [ ] Changelog presented
- [ ] Breaking changes highlighted
- [ ] Update confirmed before running
- [ ] Success verified after install

## Next Steps

This is a terminal action. The update is complete.

**Common follow-ups:**

- `/help` — See updated command reference
- `/progress` — Continue your work
</main>