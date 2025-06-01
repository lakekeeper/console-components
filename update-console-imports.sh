#!/bin/bash

# Script to update console application to use @lakekeeper/console-components
# This script will replace local component imports with library imports

CONSOLE_DIR="/Users/viktor/Biz/console"

echo "🔄 Updating console application to use @lakekeeper/console-components"
echo "📁 Target directory: $CONSOLE_DIR"

# Check if console directory exists
if [ ! -d "$CONSOLE_DIR" ]; then
    echo "❌ Console directory $CONSOLE_DIR does not exist"
    exit 1
fi

echo "📦 Step 1: Installing @lakekeeper/console-components..."
cd "$CONSOLE_DIR"

# Install the library (assuming it's linked or published locally)
npm install file:../console-components
# OR if you want to use npm link:
# cd ../console-components && npm link
# cd ../console && npm link @lakekeeper/console-components

echo "🔍 Step 2: Finding files that import old components..."

# List of components to replace
declare -A COMPONENTS=(
    ["AppFooter"]="@lakekeeper/console-components"
    ["PermissionManager"]="@lakekeeper/console-components"
    ["PermissionAssignDialog"]="@lakekeeper/console-components"
    ["UserRenameDialog"]="@lakekeeper/console-components"
    ["ProjectDialog"]="@lakekeeper/console-components"
    ["AddNamespaceDialog"]="@lakekeeper/console-components"
    ["RoleDialog"]="@lakekeeper/console-components"
    ["AppBar"]="@lakekeeper/console-components"
    ["NavigationBar"]="@lakekeeper/console-components"
    ["WarningBanner"]="@lakekeeper/console-components"
    ["SnackbarMessage"]="@lakekeeper/console-components"
    ["BreadcrumbsFromUrl"]="@lakekeeper/console-components"
    ["DialogDelete"]="@lakekeeper/console-components"
    ["ServerInformation"]="@lakekeeper/console-components"
    ["UserManager"]="@lakekeeper/console-components"
)

# Find all .vue, .ts, and .js files that might import these components
echo "🔍 Searching for component imports..."
find src -name "*.vue" -o -name "*.ts" -o -name "*.js" | while read file; do
    # Check if file imports any of our components
    for component in "${!COMPONENTS[@]}"; do
        if grep -q "import.*${component}.*from.*['\"].*components/" "$file"; then
            echo "📄 Found $component import in: $file"
            
            # Create backup
            cp "$file" "${file}.backup"
            
            # Replace the import
            # Pattern: import ComponentName from './path/to/components/ComponentName.vue'
            # Replace with: import { ComponentName } from '@lakekeeper/console-components'
            
            # First, remove the old import line
            sed -i '' "/import.*${component}.*from.*['\"].*components\//d" "$file"
            
            # Then add the new import at the top (after any existing library imports)
            if ! grep -q "import.*${component}.*from.*@lakekeeper/console-components" "$file"; then
                # Find the last import line and add our import after it
                sed -i '' "/^import.*from.*['\"].*['\"];*$/a\\
import { ${component} } from '@lakekeeper/console-components';
" "$file"
            fi
            
            echo "✅ Updated $component import in: $file"
        fi
    done
done

echo ""
echo "🎨 Step 3: Adding CSS import..."

# Find main.ts or main.js to add CSS import
MAIN_FILE=""
if [ -f "src/main.ts" ]; then
    MAIN_FILE="src/main.ts"
elif [ -f "src/main.js" ]; then
    MAIN_FILE="src/main.js"
fi

if [ -n "$MAIN_FILE" ]; then
    if ! grep -q "@lakekeeper/console-components/style.css" "$MAIN_FILE"; then
        # Add CSS import after other imports
        echo "import '@lakekeeper/console-components/style.css';" >> "$MAIN_FILE"
        echo "✅ Added CSS import to $MAIN_FILE"
    else
        echo "ℹ️  CSS import already exists in $MAIN_FILE"
    fi
else
    echo "⚠️  Could not find main.ts or main.js to add CSS import"
fi

echo ""
echo "🎉 Update complete!"
echo ""
echo "📋 Summary:"
echo "  ✅ Installed @lakekeeper/console-components"
echo "  ✅ Updated component imports to use library"
echo "  ✅ Added CSS import"
echo "  📦 Backup files created with .backup extension"
echo ""
echo "🚀 Next steps:"
echo "  1. Test your application: npm run dev"
echo "  2. If everything works, remove backup files: find src -name '*.backup' -delete"
echo "  3. If issues occur, restore backups: find src -name '*.backup' -exec sh -c 'mv \"$1\" \"${1%.backup}\"' _ {} \\;"
