#!/bin/bash

# Quick commands to update console imports
# Run these commands from the console directory

echo "🚀 Quick Console Import Update Commands"
echo "========================================"
echo ""

echo "1️⃣ Install the component library:"
echo "cd /Users/viktor/Biz/console"
echo "npm install file:../console-components"
echo ""

echo "2️⃣ Update main.ts to include CSS:"
echo "echo \"import '@lakekeeper/console-components/style.css';\" >> src/main.ts"
echo ""

echo "3️⃣ Find and update component imports manually:"
echo "# Search for files with old imports:"
echo "grep -r \"import.*from.*components/\" src/"
echo ""

echo "# Example replacements (run for each file):"
echo "# Replace AppFooter import:"
echo "sed -i '' 's/import AppFooter from.*components.*AppFooter.vue.*/import { AppFooter } from '\''@lakekeeper\/console-components'\'';/' src/YourFile.vue"
echo ""
echo "# Replace PermissionManager import:"
echo "sed -i '' 's/import PermissionManager from.*components.*PermissionManager.vue.*/import { PermissionManager } from '\''@lakekeeper\/console-components'\'';/' src/YourFile.vue"
echo ""
echo "# Replace AppBar import:"
echo "sed -i '' 's/import AppBar from.*components.*AppBar.vue.*/import { AppBar } from '\''@lakekeeper\/console-components'\'';/' src/YourFile.vue"
echo ""

echo "4️⃣ For files using multiple components, replace with destructured import:"
echo "# Instead of multiple imports, use one:"
echo "# import { AppFooter, PermissionManager, AppBar } from '@lakekeeper/console-components';"
echo ""

echo "5️⃣ Test the changes:"
echo "npm run dev"
echo ""

echo "6️⃣ Alternative: Use the automated script:"
echo "cd /Users/viktor/Biz/console-components"
echo "./update-console-imports.sh"
echo ""

echo "📋 Available components:"
echo "  AppFooter, PermissionManager, PermissionAssignDialog,"
echo "  UserRenameDialog, ProjectDialog, AddNamespaceDialog,"
echo "  RoleDialog, AppBar, NavigationBar, WarningBanner,"
echo "  SnackbarMessage, BreadcrumbsFromUrl, DialogDelete,"
echo "  ServerInformation, UserManager"
