#!/bin/bash

# Script to remove old components from the console directory
# All these components have been successfully transferred to console-components

CONSOLE_DIR="/Users/viktor/Biz/console/src/components"

echo "🗑️ Removing old components from console directory..."
echo "📁 Target directory: $CONSOLE_DIR"

# Check if directory exists
if [ ! -d "$CONSOLE_DIR" ]; then
    echo "❌ Directory $CONSOLE_DIR does not exist"
    exit 1
fi

# List of components to remove (successfully transferred)
COMPONENTS=(
    "AppFooter.vue"
    "PermissionManager.vue" 
    "PermissionAssignDialog.vue"
    "UserRenameDialog.vue"
    "ProjectDialog.vue"
    "AddNamespaceDialog.vue"
    "RoleDialog.vue"
    "AppBar.vue"
    "NavigationBar.vue"
    "WarningBanner.vue"
    "SnackbarMessage.vue"
    "BreadcrumbsFromUrl.vue"
    "DialogDelete.vue"
    "ServerInformation.vue"
    "UserManager.vue"
)

# Create backup directory
BACKUP_DIR="/Users/viktor/Biz/console/src/components/backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup at: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Remove components
for component in "${COMPONENTS[@]}"; do
    if [ -f "$CONSOLE_DIR/$component" ]; then
        echo "🔄 Backing up and removing: $component"
        cp "$CONSOLE_DIR/$component" "$BACKUP_DIR/"
        rm "$CONSOLE_DIR/$component"
        echo "✅ Removed: $component"
    else
        echo "⚠️  Not found: $component"
    fi
done

echo ""
echo "🎉 Cleanup complete!"
echo "📦 Backup created at: $BACKUP_DIR"
echo "📚 All components are now available in console-components library"
echo ""
echo "💡 To use the components, install the library:"
echo "   npm install @lakekeeper/console-components"
echo ""
echo "📖 Import components like:"
echo "   import { AppFooter, PermissionManager } from '@lakekeeper/console-components';"
